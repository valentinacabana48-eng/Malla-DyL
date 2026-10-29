'use client';
import React, { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  ChevronDown,
  ChevronUp,
  Users,
  Clock,
  MapPin,
  Tag,
  Loader2,
  Check,
} from 'lucide-react';
import { useAppContext, SHIFT_COLOR_OPTIONS } from '@/context/AppContext';
import type { Worker, Shift } from '@/context/AppContext';
import { readFirstSheetRows, downloadSimpleWorkbook } from '@/lib/excel';
import { normalizeRut, formatRut } from '@/lib/rut';

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportType = 'workers' | 'shifts' | 'sucursales' | 'areas';

interface ParsedWorker {
  name: string;
  rut: string;
  cargo: string;
  role: string;
  sucursal: string;
  area: string;
  /** null = la celda venía vacía (no se cambia a quien ya existe) */
  horasContratadas: number | null;
  estado: 'Activo' | 'Inactivo' | null;
  birthday: string;
}

interface ParsedShift {
  label: string;
  start: string;
  end: string;
  colacion: number;
  colorIndex: number;
}

interface ParseResult {
  workers: ParsedWorker[];
  shifts: ParsedShift[];
  sucursales: string[];
  areas: string[];
  errors: string[];
}

// ─── Template Definitions ─────────────────────────────────────────────────────

const TEMPLATES: Record<ImportType, { headers: string[]; example: (string | number)[][] }> = {
  workers: {
    headers: [
      'Nombre',
      'RUT',
      'Cargo',
      'Rol',
      'Sucursal',
      'Área',
      'HorasContratadas',
      'Estado',
      'Cumpleaños',
    ],
    example: [
      [
        'María González',
        '12.345.678-9',
        'Cajera',
        'Cajera',
        'Mayorista Talca',
        'Cajas',
        42,
        'Activo',
        '1990-05-15',
      ],
      [
        'Ana Pérez',
        '9.876.543-2',
        'Supervisora',
        'Supervisor',
        'Mayorista Curicó',
        'Tesorería',
        30,
        'Activo',
        '1985-11-20',
      ],
    ],
  },
  shifts: {
    headers: ['Nombre', 'HoraEntrada', 'HoraSalida', 'ColacionMinutos', 'ColorIndice'],
    example: [
      ['Turno Mañana', '06:00', '14:00', 30, 0],
      ['Turno Tarde', '14:00', '22:00', 30, 1],
      ['Turno Noche', '22:00', '06:00', 0, 2],
    ],
  },
  sucursales: {
    headers: ['Nombre'],
    example: [['Mayorista Talca'], ['Mayorista Curicó'], ['Mayorista Linares']],
  },
  areas: {
    headers: ['Nombre'],
    example: [['Cajas'], ['Tesorería'], ['Bodega']],
  },
};

const IMPORT_TABS: { id: ImportType; label: string; icon: React.ElementType }[] = [
  { id: 'workers', label: 'Trabajadoras', icon: Users },
  { id: 'shifts', label: 'Turnos', icon: Clock },
  { id: 'sucursales', label: 'Sucursales', icon: MapPin },
  { id: 'areas', label: 'Áreas', icon: Tag },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(): string {
  return `w-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

function generateCode(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 20) || `turno-${Date.now()}`
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Nombre sin tildes, mayúsculas ni espacios de más, para comparar
function normalizeName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Cumpleaños a AAAA-MM-DD: acepta fecha de Excel, AAAA-MM-DD y DD-MM-AAAA / DD/MM/AAAA
function normalizeBirthday(value: unknown): string {
  if (typeof value === 'number' && value > 0) {
    const d = new Date(Math.round((value - 25569) * 86400000));
    return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  const text = String(value ?? '').trim();
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

// ─── Plan de importación de trabajadoras ─────────────────────────────────────

const WORKER_FIELD_LABELS = {
  name: 'nombre',
  rut: 'RUT',
  cargo: 'cargo',
  role: 'rol',
  sucursal: 'sucursal',
  area: 'área',
  horasContratadas: 'horas',
  estado: 'estado',
  birthday: 'cumpleaños',
} as const;
type WorkerField = keyof typeof WORKER_FIELD_LABELS;

type WorkerPlanItem =
  | { kind: 'new'; parsed: ParsedWorker }
  | { kind: 'update'; parsed: ParsedWorker; existing: Worker; updated: Worker; changes: string[] }
  | { kind: 'same'; parsed: ParsedWorker }
  | { kind: 'ambiguous'; parsed: ParsedWorker };

/**
 * Decide qué pasa con cada fila: si la trabajadora ya existe (por RUT o, si no hay RUT,
 * por nombre) se actualizan los datos que vengan en el archivo; las celdas vacías no
 * borran nada. Si no existe, se crea.
 */
function planWorkerImport(parsedWorkers: ParsedWorker[], workers: Worker[]): WorkerPlanItem[] {
  const known: Worker[] = [...workers];
  // Las que este mismo archivo ya va a crear (por si vienen repetidas)
  const pending = new Set<Worker>();

  const findExisting = (rut: string, name: string): Worker | null | 'ambiguous' => {
    const nRut = normalizeRut(rut);
    if (nRut) {
      const byRut = known.find((k) => normalizeRut(k.rut) === nRut);
      if (byRut) return byRut;
    }
    // Por nombre: solo a quien no tiene RUT (o tiene el mismo); con RUT distinto es otra persona
    const byName = known.filter(
      (k) =>
        normalizeName(k.name) === normalizeName(name) &&
        (!nRut || !normalizeRut(k.rut) || normalizeRut(k.rut) === nRut)
    );
    if (byName.length > 1) return 'ambiguous';
    return byName[0] || null;
  };

  return parsedWorkers.map((w) => {
    const existing = findExisting(w.rut, w.name);
    if (existing === 'ambiguous') return { kind: 'ambiguous', parsed: w };
    if (existing && pending.has(existing)) return { kind: 'same', parsed: w };
    if (!existing) {
      const marker = { name: w.name, rut: w.rut } as Worker;
      pending.add(marker);
      known.push(marker);
      return { kind: 'new', parsed: w };
    }

    const name = w.name || existing.name;
    const updated: Worker = {
      ...existing,
      name,
      initials: name !== existing.name ? getInitials(name) : existing.initials,
      rut: w.rut || existing.rut,
      cargo: w.cargo || existing.cargo,
      // Sin columna «Rol» (listado de Personal), el rol sigue al cargo si este cambió
      role: w.role || (w.cargo && w.cargo !== existing.cargo ? w.cargo : existing.role),
      sucursal: w.sucursal || existing.sucursal,
      area: w.area || existing.area,
      horasContratadas: w.horasContratadas ?? existing.horasContratadas,
      estado: w.estado ?? existing.estado,
      birthday: w.birthday || existing.birthday,
    };
    const changes = (Object.keys(WORKER_FIELD_LABELS) as WorkerField[])
      .filter((k) =>
        k === 'name'
          ? normalizeName(updated.name) !== normalizeName(existing.name)
          : k === 'rut'
            ? normalizeRut(updated.rut) !== normalizeRut(existing.rut)
            : String(updated[k] ?? '') !== String(existing[k] ?? '')
      )
      .map((k) => WORKER_FIELD_LABELS[k]);
    known[known.indexOf(existing)] = updated;
    if (changes.length === 0) return { kind: 'same', parsed: w };
    return { kind: 'update', parsed: w, existing, updated, changes };
  });
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-yellow-500',
];

function parseSheetData(data: unknown[][]): ParseResult {
  const result: ParseResult = { workers: [], shifts: [], sucursales: [], areas: [], errors: [] };
  if (!data || data.length < 2) {
    result.errors.push('El archivo está vacío o no tiene datos suficientes.');
    return result;
  }

  const normalizeHeaders = (row: unknown[]) =>
    row.map((h) =>
      String(h || '')
        .trim()
        .toLowerCase()
    );
  // El encabezado puede no estar en la primera fila (el listado de Personal trae un título
  // arriba): se usa la primera fila que tenga la columna «Nombre».
  const found = data.slice(0, 10).findIndex((row) => normalizeHeaders(row).includes('nombre'));
  const headerIdx = found >= 0 ? found : 0;
  const headers = normalizeHeaders(data[headerIdx]);
  const rows = data
    .slice(headerIdx + 1)
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cell !== ''));

  // Detect type by headers
  if (headers.includes('nombre') && headers.includes('rut')) {
    // Workers
    rows.forEach((row, i) => {
      const get = (key: string) => {
        const idx = headers.indexOf(key);
        return idx >= 0 ? String(row[idx] || '').trim() : '';
      };
      const name = get('nombre');
      if (!name) {
        result.errors.push(`Fila ${i + headerIdx + 2}: Nombre vacío, se omite.`);
        return;
      }
      // Fila «Total: N trabajadoras» al pie del listado de Personal
      if (!get('rut') && /^total:/i.test(name)) return;
      const horasRaw =
        get('horascontratadas') || get('horas contratadas') || get('horas sem.') || get('horas');
      const horas = parseInt(horasRaw, 10);
      const estadoRaw = get('estado').toLowerCase();
      const birthdayIdx = ['cumpleaños', 'cumpleanos', 'birthday']
        .map((k) => headers.indexOf(k))
        .find((idx) => idx >= 0);
      result.workers.push({
        name,
        rut: formatRut(get('rut')),
        cargo: get('cargo'),
        role: get('rol') || get('role'),
        sucursal: get('sucursal'),
        area: get('área') || get('area'),
        horasContratadas: isNaN(horas) ? null : horas,
        estado: estadoRaw === 'inactivo' ? 'Inactivo' : estadoRaw === 'activo' ? 'Activo' : null,
        birthday: birthdayIdx !== undefined ? normalizeBirthday(row[birthdayIdx]) : '',
      });
    });
  } else if (
    headers.includes('nombre') &&
    (headers.includes('horaentrada') || headers.includes('hora entrada'))
  ) {
    // Shifts
    rows.forEach((row, i) => {
      const get = (key: string) => {
        const idx = headers.indexOf(key);
        return idx >= 0 ? String(row[idx] || '').trim() : '';
      };
      const label = get('nombre');
      if (!label) {
        result.errors.push(`Fila ${i + headerIdx + 2}: Nombre vacío, se omite.`);
        return;
      }
      const colacion = parseInt(
        get('colacionminutos') || get('colacion minutos') || get('colacion') || '0',
        10
      );
      const colorIdx = parseInt(
        get('colorindice') || get('color indice') || get('color') || '0',
        10
      );
      result.shifts.push({
        label,
        start: get('horaentrada') || get('hora entrada'),
        end: get('horasalida') || get('hora salida'),
        colacion: isNaN(colacion) ? 0 : colacion,
        colorIndex: isNaN(colorIdx) || colorIdx >= SHIFT_COLOR_OPTIONS.length ? 0 : colorIdx,
      });
    });
  } else if (headers.length === 1 && headers[0] === 'nombre') {
    // Could be sucursales or areas — we'll return both and let user pick
    rows.forEach((row) => {
      const val = String(row[0] || '').trim();
      if (val) {
        result.sucursales.push(val);
        result.areas.push(val);
      }
    });
  } else {
    result.errors.push('No se pudo detectar el tipo de datos. Usa una plantilla descargada.');
  }

  return result;
}

// ─── Download Template ────────────────────────────────────────────────────────

function downloadTemplate(type: ImportType) {
  const tpl = TEMPLATES[type];
  downloadSimpleWorkbook(
    [{ name: 'Plantilla', rows: [tpl.headers, ...tpl.example] }],
    `plantilla_${type}.xlsx`
  );
}

// ─── Preview Table ────────────────────────────────────────────────────────────

function PreviewTable({
  type,
  data,
  workerPlan,
}: {
  type: ImportType;
  data: ParseResult;
  workerPlan?: WorkerPlanItem[];
}) {
  const [expanded, setExpanded] = useState(true);
  const planCount = (kind: WorkerPlanItem['kind']) =>
    (workerPlan || []).filter((p) => p.kind === kind).length;

  const items =
    type === 'workers'
      ? data.workers
      : type === 'shifts'
        ? data.shifts
        : type === 'sucursales'
          ? data.sucursales
          : data.areas;

  if (items.length === 0) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Eye size={14} className="text-secondary" />
          Vista previa — {items.length}{' '}
          {type === 'workers'
            ? 'trabajadora(s)'
            : type === 'shifts'
              ? 'turno(s)'
              : type === 'sucursales'
                ? 'sucursal(es)'
                : 'área(s)'}
          {type === 'workers' && workerPlan && (
            <span className="font-normal text-muted-foreground">
              · {planCount('new')} nueva(s), {planCount('update')} se actualizan
              {planCount('same') > 0 && `, ${planCount('same')} sin cambios`}
              {planCount('ambiguous') > 0 && `, ${planCount('ambiguous')} se omiten`}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-xs">
            <thead className="bg-muted/20 sticky top-0">
              <tr>
                {type === 'workers' && workerPlan && (
                  <th className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                    Qué pasa
                  </th>
                )}
                {TEMPLATES[type].headers.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {type === 'workers' &&
                data.workers.map((w, i) => (
                  <tr key={i} className="hover:bg-muted/10">
                    {workerPlan && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <WorkerPlanBadge item={workerPlan[i]} />
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-foreground">{w.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{w.rut}</td>
                    <td className="px-3 py-2 text-muted-foreground">{w.cargo}</td>
                    <td className="px-3 py-2 text-muted-foreground">{w.role}</td>
                    <td className="px-3 py-2 text-muted-foreground">{w.sucursal}</td>
                    <td className="px-3 py-2 text-muted-foreground">{w.area}</td>
                    <td className="px-3 py-2 text-muted-foreground">{w.horasContratadas ?? ''}</td>
                    <td className="px-3 py-2">
                      {w.estado && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${w.estado === 'Activo' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                        >
                          {w.estado}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{w.birthday}</td>
                  </tr>
                ))}
              {type === 'shifts' &&
                data.shifts.map((s, i) => (
                  <tr key={i} className="hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium text-foreground">{s.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.start}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.end}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.colacion}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SHIFT_COLOR_OPTIONS[s.colorIndex]?.colorClass}`}
                      >
                        {SHIFT_COLOR_OPTIONS[s.colorIndex]?.label}
                      </span>
                    </td>
                  </tr>
                ))}
              {(type === 'sucursales' || type === 'areas') &&
                (type === 'sucursales' ? data.sucursales : data.areas).map((item, i) => (
                  <tr key={i} className="hover:bg-muted/10">
                    <td className="px-3 py-2 font-medium text-foreground">{item}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WorkerPlanBadge({ item }: { item?: WorkerPlanItem }) {
  if (!item) return null;
  if (item.kind === 'new')
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
        Nueva
      </span>
    );
  if (item.kind === 'update')
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700"
        title={item.changes.join(', ')}
      >
        Actualiza: {item.changes.join(', ')}
      </span>
    );
  if (item.kind === 'same')
    return <span className="text-xs text-muted-foreground">Sin cambios</span>;
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700"
      title="Hay más de una con ese nombre; agrega el RUT para distinguirlas"
    >
      Se omite (nombre repetido)
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExcelImportPanel() {
  const {
    workers,
    shifts,
    sucursales,
    areas,
    addWorker,
    updateWorker,
    addShift,
    addSucursal,
    addArea,
  } = useAppContext();

  const [activeType] = useState<ImportType>('workers');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<ImportType>>(new Set());
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      setIsLoading(true);
      setParseResult(null);
      setImportSuccess(null);
      setFileName(file.name);

      (async () => {
        try {
          const rows = await readFirstSheetRows(file, '');
          const result = parseSheetData(rows);
          setParseResult(result);

          // Auto-select detected types
          const detected = new Set<ImportType>();
          if (result.workers.length > 0) detected.add('workers');
          if (result.shifts.length > 0) detected.add('shifts');
          if (result.sucursales.length > 0 && activeType === 'sucursales')
            detected.add('sucursales');
          if (result.areas.length > 0 && activeType === 'areas') detected.add('areas');
          setSelectedTypes(detected);
        } catch (err) {
          const message =
            err instanceof Error && err.message.includes('.xls')
              ? err.message
              : 'Error al leer el archivo. Asegúrate de que sea un .xlsx o .csv válido.';
          setParseResult({ workers: [], shifts: [], sucursales: [], areas: [], errors: [message] });
        } finally {
          setIsLoading(false);
        }
      })();
    },
    [activeType]
  );

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function toggleType(type: ImportType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleImport() {
    if (!parseResult) return;
    let count = 0;
    const workerNotes: string[] = [];

    if (selectedTypes.has('workers')) {
      let updated = 0;
      let unchanged = 0;
      let ambiguous = 0;

      planWorkerImport(parseResult.workers, workers).forEach((item, i) => {
        if (item.kind === 'ambiguous') {
          ambiguous++;
          return;
        }
        if (item.kind === 'same') {
          unchanged++;
          return;
        }
        if (item.kind === 'update') {
          updateWorker(item.updated);
          updated++;
          return;
        }
        const w = item.parsed;
        const worker: Worker = {
          id: generateId() + i,
          name: w.name,
          initials: getInitials(w.name),
          rut: w.rut,
          cargo: w.cargo,
          role: w.role || w.cargo,
          sucursal: w.sucursal,
          area: w.area,
          horasContratadas: w.horasContratadas ?? 42,
          estado: w.estado ?? 'Activo',
          avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
          birthday: w.birthday,
        };
        addWorker(worker);
        count++;
      });

      if (updated > 0) workerNotes.push(`${updated} ya existían y se actualizaron sus datos`);
      if (unchanged > 0) workerNotes.push(`${unchanged} ya existían y no tenían cambios`);
      if (ambiguous > 0)
        workerNotes.push(
          `${ambiguous} se omitieron porque hay más de una con ese nombre (agrega el RUT para distinguirlas)`
        );
    }

    if (selectedTypes.has('shifts')) {
      parseResult.shifts.forEach((s) => {
        const code = generateCode(s.label);
        if (shifts[code]) return; // skip duplicates
        const colorOpt = SHIFT_COLOR_OPTIONS[s.colorIndex] || SHIFT_COLOR_OPTIONS[0];
        const shift: Shift = {
          code,
          label: s.label,
          start: s.start,
          end: s.end,
          colorClass: colorOpt.colorClass,
          legendColor: colorOpt.legendColor,
          colacion: s.colacion,
        };
        addShift(shift);
        count++;
      });
    }

    if (selectedTypes.has('sucursales')) {
      parseResult.sucursales.forEach((name) => {
        if (!sucursales.some((s) => s.name === name)) {
          addSucursal(name);
          count++;
        }
      });
    }

    if (selectedTypes.has('areas')) {
      parseResult.areas.forEach((name) => {
        if (!areas.includes(name)) {
          addArea(name);
          count++;
        }
      });
    }

    setImportSuccess(
      `✓ Se importaron ${count} registros nuevos.` +
        (workerNotes.length > 0 ? ` Trabajadoras: ${workerNotes.join('; ')}.` : '')
    );
    setParseResult(null);
    setFileName(null);
    setSelectedTypes(new Set());
  }

  const hasData =
    parseResult &&
    (parseResult.workers.length > 0 ||
      parseResult.shifts.length > 0 ||
      parseResult.sucursales.length > 0 ||
      parseResult.areas.length > 0);

  const canImport = hasData && selectedTypes.size > 0;

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-1">
        <FileSpreadsheet size={18} className="text-secondary" />
        <h2 className="text-base font-semibold text-foreground">Importar desde Excel / CSV</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Carga masivamente trabajadoras, turnos, sucursales y áreas desde un archivo .xlsx o .csv.
      </p>

      {/* Template downloads */}
      <div className="bg-muted/20 border border-border rounded-xl p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Descargar plantilla
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {IMPORT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => downloadTemplate(tab.id)}
              className="flex items-center gap-2 px-3 py-2.5 bg-card border border-border rounded-lg text-xs font-semibold text-foreground hover:border-secondary hover:text-secondary transition-all group"
            >
              <Download
                size={13}
                className="text-muted-foreground group-hover:text-secondary transition-colors"
              />
              <tab.icon
                size={13}
                className="text-muted-foreground group-hover:text-secondary transition-colors"
              />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-secondary bg-secondary/5'
            : 'border-border hover:border-secondary/50 hover:bg-muted/20'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleFileChange}
          className="hidden"
        />
        {isLoading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="text-secondary animate-spin" />
            <p className="text-sm text-muted-foreground">Procesando archivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isDragging ? 'bg-secondary/20' : 'bg-muted/40'}`}
            >
              <Upload
                size={24}
                className={isDragging ? 'text-secondary' : 'text-muted-foreground'}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {fileName
                  ? `Archivo: ${fileName}`
                  : 'Arrastra tu archivo aquí o haz clic para seleccionar'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Formatos aceptados: .xlsx, .xls, .csv
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Success message */}
      {importSuccess && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-semibold">
          <CheckCircle size={16} />
          {importSuccess}
        </div>
      )}

      {/* Parse errors */}
      {parseResult && parseResult.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
            <AlertTriangle size={15} />
            Advertencias al procesar el archivo
          </div>
          {parseResult.errors.map((err, i) => (
            <p key={i} className="text-xs text-red-600 pl-5">
              • {err}
            </p>
          ))}
        </div>
      )}

      {/* Data preview + type selection */}
      {hasData && (
        <div className="space-y-4">
          {/* What to import */}
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              ¿Qué deseas importar?
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {IMPORT_TABS.map((tab) => {
                const count =
                  tab.id === 'workers'
                    ? parseResult!.workers.length
                    : tab.id === 'shifts'
                      ? parseResult!.shifts.length
                      : tab.id === 'sucursales'
                        ? parseResult!.sucursales.length
                        : parseResult!.areas.length;
                const isSelected = selectedTypes.has(tab.id);
                const hasItems = count > 0;
                return (
                  <button
                    key={tab.id}
                    onClick={() => hasItems && toggleType(tab.id)}
                    disabled={!hasItems}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold border transition-all ${
                      !hasItems
                        ? 'border-border text-muted-foreground/40 cursor-not-allowed bg-muted/10'
                        : isSelected
                          ? 'border-secondary bg-secondary/10 text-secondary'
                          : 'border-border text-foreground hover:border-secondary/50'
                    }`}
                  >
                    {isSelected ? <Check size={13} /> : <tab.icon size={13} />}
                    {tab.label}
                    {hasItems && (
                      <span className="ml-auto bg-secondary/20 text-secondary px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview tables */}
          {selectedTypes.has('workers') && parseResult!.workers.length > 0 && (
            <PreviewTable
              type="workers"
              data={parseResult!}
              workerPlan={planWorkerImport(parseResult!.workers, workers)}
            />
          )}
          {selectedTypes.has('shifts') && parseResult!.shifts.length > 0 && (
            <PreviewTable type="shifts" data={parseResult!} />
          )}
          {selectedTypes.has('sucursales') && parseResult!.sucursales.length > 0 && (
            <PreviewTable type="sucursales" data={parseResult!} />
          )}
          {selectedTypes.has('areas') && parseResult!.areas.length > 0 && (
            <PreviewTable type="areas" data={parseResult!} />
          )}

          {/* Confirm import */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleImport}
              disabled={!canImport}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-sm ${
                canImport
                  ? 'bg-secondary text-white hover:bg-blue-700'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              <CheckCircle size={15} />
              Confirmar importación
            </button>
            <button
              onClick={() => {
                setParseResult(null);
                setFileName(null);
                setSelectedTypes(new Set());
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-muted text-foreground hover:bg-muted/80 transition-all"
            >
              <XCircle size={15} />
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

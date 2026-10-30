'use client';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users,
  Clock,
  Sun,
  Star,
  Edit3,
  Save,
  X,
  AlertCircle,
  Download,
  Search,
} from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { downloadSimpleWorkbook } from '@/lib/excel';
import { useAppContext, monthLabelToKey, MESES } from '@/context/AppContext';
import { getStatusLabel } from '@/app/asistencia/components/asistenciaUtils';

// ─── Chilean public holidays 2026 (YYYY-MM-DD) ────────────────────────────
const FERIADOS_2026 = new Set([
  '2026-01-01',
  '2026-04-03',
  '2026-04-04',
  '2026-05-01',
  '2026-05-21',
  '2026-06-29',
  '2026-07-16',
  '2026-08-15',
  '2026-09-18',
  '2026-09-19',
  '2026-10-12',
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-12-08',
  '2026-12-25',
]);

function isFeriado(dateStr: string): boolean {
  return FERIADOS_2026.has(dateStr);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
// Un rango muy largo vuelve lenta la tabla: se limita a ~3 meses
const MAX_RANGE_DAYS = 93;

interface RangeDay {
  date: Date;
  /** YYYY-MM-DD */
  dateStr: string;
  /** Mes de la malla al que pertenece (YYYY-MM) */
  monthKey: string;
  /** Día del mes, desde 1 */
  day: number;
}

function buildRange(start: string, end: string, maxDays = MAX_RANGE_DAYS): RangeDay[] {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  if (!sy || !ey) return [];
  const cur = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  const days: RangeDay[] = [];
  while (cur <= last && days.length < maxDays) {
    days.push({
      date: new Date(cur),
      dateStr: toDateStr(cur),
      monthKey: `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`,
      day: cur.getDate(),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// Lunes (offset 0) o domingo (offset 6) de la semana de esa fecha
function weekEdge(dateStr: string, offset: 0 | 6): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(d - ((date.getDay() + 6) % 7) + offset);
  return toDateStr(date);
}

// 2026-10-05 → 5/10
const fmtShort = (dateStr: string) => {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d}/${m}`;
};

// 2026-10-05 → 05/10/2026
const fmtDate = (dateStr: string) => dateStr.split('-').reverse().join('/');

interface DayRecord {
  entradaReal: string;
  salidaReal: string;
  entradaColacion: string;
  salidaColacion: string;
}

interface AttendanceRecord {
  workerId: string;
  recordDate: string;
  status: string;
  absenceReason: string;
  retiroHoras: number;
}

// Cualquier estado de asistencia distinto de «Presente» es un día sin trabajar
// (falta, licencia, vacaciones, permiso, descanso...): no suma horas.
function isDayOff(att: AttendanceRecord | null): boolean {
  return !!att && att.status !== 'PRESENTE';
}

// Conteo de días del período, para descuentos y liquidación
const DAY_COUNTS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'faltaInj', label: 'Faltas injustificadas', statuses: ['AUSENTE'] },
  { key: 'faltaJust', label: 'Faltas justificadas', statuses: ['FALTA_JUSTIFICADA'] },
  { key: 'licencia', label: 'Licencias', statuses: ['LICENCIA'] },
  { key: 'vacaciones', label: 'Vacaciones', statuses: ['VACACIONES'] },
  { key: 'permisoSG', label: 'Permisos sin goce', statuses: ['PERMISO_SG'] },
  { key: 'permisoCG', label: 'Permisos con goce', statuses: ['PERMISO_CG', 'PERMISO'] },
];

// Nombre corto del estado para la celda y el Excel
function dayOffLabel(att: AttendanceRecord): string {
  if (att.status === 'AUSENTE') return 'Falta injustificada';
  if (att.status.startsWith('CUSTOM_')) {
    return att.status
      .replace(/^CUSTOM_/, '')
      .replace(/_\d+$/, '')
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());
  }
  return getStatusLabel(att.status);
}

// tiempos reales: workerId -> fecha (YYYY-MM-DD) -> DayRecord
type WorkerDayRecords = Record<string, Record<string, DayRecord>>;
// attendance keyed by workerId -> dateStr -> AttendanceRecord
type AttendanceMap = Record<string, Record<string, AttendanceRecord>>;

function calcNetHoursFromTimes(
  entrada: string,
  salida: string,
  entColacion: string,
  salColacion: string
): number {
  if (!entrada || !salida) return 0;
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  let total = toMins(salida) - toMins(entrada);
  if (total < 0) total += 24 * 60;
  if (entColacion && salColacion) {
    const colDur = toMins(salColacion) - toMins(entColacion);
    if (colDur > 0) total -= colDur;
  }
  return Math.max(0, total / 60);
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-[80px] text-xs border border-border rounded px-1 py-0.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

export default function RRHHContent() {
  const supabase = getSupabase();
  const {
    workers,
    shifts,
    scheduleData,
    specialDays,
    areas,
    sucursales,
    selectedMes,
    setSelectedMes,
    globalArea,
    globalSucursal,
  } = useAppContext();

  const [selectedArea, setSelectedArea] = useState(
    globalArea && globalArea !== 'Todas' ? globalArea : 'Todas'
  );
  const [selectedSucursal, setSelectedSucursal] = useState(globalSucursal || 'Todas');
  const [selectedCargo, setSelectedCargo] = useState('Todos');
  const [searchName, setSearchName] = useState('');
  const [activeTab, setActiveTab] = useState<'horario' | 'horas'>('horario');
  const [dayRecords, setDayRecords] = useState<WorkerDayRecords>({});
  const [editingCell, setEditingCell] = useState<{ workerId: string; dayIdx: number } | null>(null);
  const [editBuffer, setEditBuffer] = useState<DayRecord>({
    entradaReal: '',
    salidaReal: '',
    entradaColacion: '',
    salidaColacion: '',
  });
  const [mounted, setMounted] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [exporting, setExporting] = useState(false);
  // Período: el mes elegido o un rango de fechas libre
  const [periodMode, setPeriodMode] = useState<'mes' | 'rango'>('mes');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (globalSucursal) setSelectedSucursal(globalSucursal);
  }, [globalSucursal]);

  useEffect(() => {
    if (globalArea && globalArea !== 'Todas') setSelectedArea(globalArea);
  }, [globalArea]);

  const monthKey = useMemo(() => monthLabelToKey(selectedMes), [selectedMes]);

  // ─── Período visible: el mes elegido o el rango de fechas ──────────────
  const monthStartDate = `${monthKey}-01`;
  const monthEndDate = useMemo(() => {
    const [y, m] = monthKey.split('-').map(Number);
    return `${monthKey}-${pad2(new Date(y, m, 0).getDate())}`;
  }, [monthKey]);

  const rangeValid = !!rangeFrom && !!rangeTo && rangeFrom <= rangeTo;
  const useRange = periodMode === 'rango' && rangeValid;
  const periodStart = useRange ? rangeFrom : monthStartDate;
  const days = useMemo(
    () => buildRange(useRange ? rangeFrom : monthStartDate, useRange ? rangeTo : monthEndDate),
    [useRange, rangeFrom, rangeTo, monthStartDate, monthEndDate]
  );
  const numDays = days.length;
  // Si el rango pasa de ~3 meses se corta: el fin real es el último día mostrado
  const periodEnd = days[numDays - 1]?.dateStr ?? periodStart;
  const rangeTruncated = useRange && periodEnd < rangeTo;
  // Las semanas se calculan completas (lunes a domingo) aunque parte caiga fuera del
  // período: se necesitan esos días extra de asistencia, malla y horarios reales.
  const calcStart = weekEdge(periodStart, 0);
  const calcEnd = weekEdge(periodEnd, 6);
  const calcDays = useMemo(
    () => buildRange(calcStart, calcEnd, MAX_RANGE_DAYS + 14),
    [calcStart, calcEnd]
  );
  const periodLabel = useRange ? `${fmtDate(periodStart)} al ${fmtDate(periodEnd)}` : selectedMes;

  // Al pasar a rango por primera vez, parte con el mes que se estaba viendo
  const switchToRange = () => {
    if (!rangeFrom) setRangeFrom(monthStartDate);
    if (!rangeTo) setRangeTo(monthEndDate);
    setPeriodMode('rango');
  };

  // ─── Load attendance records from Supabase for the selected month ──────
  const loadAttendance = useCallback(async () => {
    setLoadingAttendance(true);
    try {
      // Un mes tiene más de 1000 registros: se piden por páginas
      const data = await fetchAll((from, to) =>
        supabase
          .from('attendance_records')
          .select('worker_id, record_date, status, absence_reason, retiro_horas')
          .gte('record_date', calcStart)
          .lte('record_date', calcEnd)
          .order('worker_id')
          .order('record_date')
          .range(from, to)
      );

      const map: AttendanceMap = {};
      (data ?? []).forEach((r: Record<string, unknown>) => {
        const wid = r.worker_id as string;
        const dt = r.record_date as string;
        if (!map[wid]) map[wid] = {};
        map[wid][dt] = {
          workerId: wid,
          recordDate: dt,
          status: r.status as string,
          absenceReason: (r.absence_reason as string) || '',
          retiroHoras: Number(r.retiro_horas) || 0,
        };
      });
      setAttendanceMap(map);
    } catch (err) {
      console.error('Error loading attendance in RRHH:', err);
    } finally {
      setLoadingAttendance(false);
    }
  }, [calcStart, calcEnd, supabase]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // ─── Base filtered workers (area + sucursal) ───────────────────────────
  const baseFilteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (w.estado !== 'Activo') return false;
      if (selectedArea !== 'Todas' && w.area !== selectedArea) return false;
      if (selectedSucursal !== 'Todas' && w.sucursal !== selectedSucursal) return false;
      return true;
    });
  }, [workers, selectedArea, selectedSucursal]);

  // ─── Cargo options derived from base filtered workers ─────────────────
  const cargoOptions = useMemo(() => {
    const cargos = Array.from(
      new Set(baseFilteredWorkers.map((w) => w.cargo).filter(Boolean))
    ).sort();
    return ['Todos', ...cargos];
  }, [baseFilteredWorkers]);

  // ─── Final filtered workers (+ cargo + name search) ───────────────────
  const filteredWorkers = useMemo(() => {
    return baseFilteredWorkers.filter((w) => {
      if (selectedCargo !== 'Todos' && w.cargo !== selectedCargo) return false;
      if (searchName.trim()) {
        const q = searchName.trim().toLowerCase();
        if (!w.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [baseFilteredWorkers, selectedCargo, searchName]);

  const areaOptions = useMemo(() => ['Todas', ...areas], [areas]);
  const sucursalOptions = useMemo(
    () => ['Todas', ...(mounted ? sucursales.map((s) => s.name) : [])],
    [sucursales, mounted]
  );

  // ─── Get programmed shift info for a worker/day ────────────────────────
  // dayIdx = posición del día dentro del período visible
  const getProgrammedShift = (workerId: string, dayIdx: number) =>
    programmedFor(workerId, days[dayIdx]);

  const programmedFor = (workerId: string, d: RangeDay | undefined) => {
    if (!d) return null;
    const special = specialDays[d.monthKey]?.[workerId]?.[d.day - 1];
    if (special) return { type: 'special', code: special };
    const code = scheduleData[d.monthKey]?.[workerId]?.[d.day - 1];
    if (!code) return null;
    if (code === 'DESC') return { type: 'desc', code: 'DESC' };
    const shift = shifts[code];
    if (!shift) return null;
    return { type: 'shift', code, shift };
  };

  // ─── Get attendance record for a worker/day ────────────────────────────
  const getAttendanceForDay = (workerId: string, dayIdx: number): AttendanceRecord | null => {
    const dateStr = days[dayIdx]?.dateStr;
    return (dateStr && attendanceMap[workerId]?.[dateStr]) || null;
  };

  // ─── Edit handlers ─────────────────────────────────────────────────────
  const startEdit = (workerId: string, dayIdx: number) => {
    const existing = dayRecords[workerId]?.[days[dayIdx].dateStr];
    const prog = getProgrammedShift(workerId, dayIdx);
    let defaultEntry: DayRecord = {
      entradaReal: '',
      salidaReal: '',
      entradaColacion: '',
      salidaColacion: '',
    };
    if (!existing && prog?.type === 'shift' && prog.shift) {
      defaultEntry = {
        entradaReal: prog.shift.start || '',
        salidaReal: prog.shift.end || '',
        entradaColacion: '',
        salidaColacion: '',
      };
    }
    setEditBuffer(existing || defaultEntry);
    setEditingCell({ workerId, dayIdx });
  };

  const saveEdit = async () => {
    if (!editingCell) return;
    const { workerId, dayIdx } = editingCell;
    const { dateStr, monthKey: dayMonthKey } = days[dayIdx];
    const previous = dayRecords[workerId]?.[dateStr];
    const setRecord = (rec: DayRecord | undefined) =>
      setDayRecords((prev) => {
        const forWorker = { ...(prev[workerId] || {}) };
        if (rec) forWorker[dateStr] = rec;
        else delete forWorker[dateStr];
        return { ...prev, [workerId]: forWorker };
      });
    setRecord({ ...editBuffer });
    setEditingCell(null);

    // Persist to Supabase
    try {
      const { error } = await supabase.from('rrhh_time_records').upsert(
        {
          worker_id: workerId,
          record_date: dateStr,
          month_key: dayMonthKey,
          entrada_real: editBuffer.entradaReal || null,
          salida_real: editBuffer.salidaReal || null,
          entrada_colacion: editBuffer.entradaColacion || null,
          salida_colacion: editBuffer.salidaColacion || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'worker_id,record_date' }
      );
      if (error) throw error;
    } catch (err) {
      // Si no se guardó, se vuelve a lo que había para no mostrar un dato que no existe
      console.error('Error saving time record:', err);
      setRecord(previous);
      alert('No se pudo guardar el horario real. Revisa tu conexión e intenta de nuevo.');
    }
  };

  const cancelEdit = () => setEditingCell(null);

  // ─── Load time records from Supabase ──────────────────────────────────
  const loadTimeRecords = useCallback(async () => {
    try {
      const data = await fetchAll((from, to) =>
        supabase
          .from('rrhh_time_records')
          .select('*')
          .gte('record_date', calcStart)
          .lte('record_date', calcEnd)
          .order('id')
          .range(from, to)
      );

      if (data && data.length > 0) {
        const records: WorkerDayRecords = {};
        data.forEach((r: Record<string, unknown>) => {
          const wid = r.worker_id as string;
          const dt = r.record_date as string;
          if (!records[wid]) records[wid] = {};
          records[wid][dt] = {
            entradaReal: (r.entrada_real as string) || '',
            salidaReal: (r.salida_real as string) || '',
            entradaColacion: (r.entrada_colacion as string) || '',
            salidaColacion: (r.salida_colacion as string) || '',
          };
        });
        setDayRecords(records);
      } else {
        setDayRecords({});
      }
    } catch (err) {
      // Table may not exist yet — silently ignore
      console.warn('rrhh_time_records table not found or error:', err);
    }
  }, [calcStart, calcEnd, supabase]);

  useEffect(() => {
    loadTimeRecords();
  }, [loadTimeRecords]);

  // ─── Hours calculations ────────────────────────────────────────────────
  // Horas de un día: horario real si se anotó; si no, el turno de la malla, en 0 si ese día
  // no trabajó según Asistencia y descontando un retiro anticipado.
  const dayHours = (workerId: string, d: RangeDay): number => {
    const record = dayRecords[workerId]?.[d.dateStr];
    if (record && record.entradaReal && record.salidaReal) {
      return calcNetHoursFromTimes(
        record.entradaReal,
        record.salidaReal,
        record.entradaColacion,
        record.salidaColacion
      );
    }
    const att = attendanceMap[workerId]?.[d.dateStr] ?? null;
    if (isDayOff(att)) return 0;
    const prog = programmedFor(workerId, d);
    const shift = prog?.type === 'shift' ? prog.shift : null;
    if (!shift || !shift.start || !shift.end) return 0;
    const [sh, sm] = shift.start.split(':').map(Number);
    const [eh, em] = shift.end.split(':').map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins < 0) mins += 24 * 60;
    let hrs = mins / 60;
    if (shift.colacion > 0) hrs -= shift.colacion / 60;
    if (att?.retiroHoras) hrs = Math.max(0, hrs - att.retiroHoras);
    return hrs;
  };

  const calcWorkerStats = (workerId: string) => {
    // Semanas de lunes a domingo. Cada semana se cobra en el corte donde termina (su domingo),
    // sumando también los días que caen antes del inicio; así ninguna semana se cuenta dos veces.
    const weekMap: Record<string, number> = {};
    let periodHours = 0;
    let sundayHours = 0;
    let holidayHours = 0;
    let sundaySurcharge = 0;
    let diasTrabajados = 0;
    const dayCounts: Record<string, number> = {};

    for (const d of calcDays) {
      const hrs = dayHours(workerId, d);
      const monday = weekEdge(d.dateStr, 0);
      weekMap[monday] = (weekMap[monday] || 0) + hrs;

      const inPeriod = d.dateStr >= periodStart && d.dateStr <= periodEnd;
      if (!inPeriod) continue;
      periodHours += hrs;
      if (hrs > 0) diasTrabajados++;
      const status = attendanceMap[workerId]?.[d.dateStr]?.status;
      const count = status ? DAY_COUNTS.find((c) => c.statuses.includes(status)) : undefined;
      if (count) dayCounts[count.key] = (dayCounts[count.key] || 0) + 1;
      if (d.date.getDay() === 0 && hrs > 0) {
        sundayHours += hrs;
        sundaySurcharge += hrs * 0.3; // recargo dominical legal: 30% (comercio)
      }
      if (isFeriado(d.dateStr) && hrs > 0) holidayHours += hrs;
    }

    const contractedWeekly = workers.find((w) => w.id === workerId)?.horasContratadas ?? 42;
    const weeks = Object.keys(weekMap)
      .sort()
      .map((monday, idx) => {
        const sunday = weekEdge(monday, 6);
        const hrs = weekMap[monday];
        // Termina después del período: sus extras se ven en el corte siguiente
        const nextPeriod = sunday > periodEnd;
        return {
          label: `S${idx + 1}`,
          range: `${fmtShort(monday)}–${fmtShort(sunday)}`,
          fromPrev: monday < periodStart,
          nextPeriod,
          hours: Math.round(hrs * 10) / 10,
          overtime: nextPeriod ? 0 : Math.max(0, Math.round((hrs - contractedWeekly) * 10) / 10),
        };
      });

    const totalHours = periodHours;
    const totalOvertime = weeks.reduce((s, w) => s + w.overtime, 0);
    const overtimeWeeks = weeks.filter((w) => w.overtime > 0);

    const recargoDominical = Math.round(sundayHours * 0.3 * 10) / 10;
    const totalOvertimeHours = overtimeWeeks.reduce((sum, w) => sum + w.overtime, 0);
    const recargoHE = Math.round(totalOvertimeHours * 0.5 * 10) / 10;

    return {
      weeks,
      totalHours: Math.round(totalHours * 10) / 10,
      sundayHours: Math.round(sundayHours * 10) / 10,
      holidayHours: Math.round(holidayHours * 10) / 10,
      sundaySurcharge: Math.round(sundaySurcharge * 10) / 10,
      totalOvertime: Math.round(totalOvertime * 10) / 10,
      contractedWeekly,
      overtimeWeeks,
      recargoDominical,
      totalOvertimeHours,
      recargoHE,
      diasTrabajados,
      dayCounts,
    };
  };

  // ─── Excel Export ──────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      // ── Sheet 1: Horario programado ──
      const horarioHeaders = [
        'Trabajador/a',
        'RUT',
        'Cargo',
        'Área',
        'Sucursal',
        'Horas Contratadas',
      ];
      days.forEach((d) =>
        horarioHeaders.push(`${DOW_LABELS[d.date.getDay()]} ${d.day}/${d.date.getMonth() + 1}`)
      );

      const horarioRows = filteredWorkers.map((worker) => {
        const row: (string | number)[] = [
          worker.name,
          worker.rut || '',
          worker.cargo || '',
          worker.area || '',
          worker.sucursal || '',
          worker.horasContratadas,
        ];
        for (let dayIdx = 0; dayIdx < numDays; dayIdx++) {
          const att = getAttendanceForDay(worker.id, dayIdx);
          if (att && isDayOff(att)) {
            row.push(
              att.absenceReason ? `${dayOffLabel(att)}: ${att.absenceReason}` : dayOffLabel(att)
            );
            continue;
          }
          const record = dayRecords[worker.id]?.[days[dayIdx].dateStr];
          if (record && record.entradaReal && record.salidaReal) {
            row.push(`${record.entradaReal} - ${record.salidaReal}`);
            continue;
          }
          const prog = getProgrammedShift(worker.id, dayIdx);
          if (!prog) {
            row.push('');
            continue;
          }
          if (prog.type === 'desc') {
            row.push('DESC');
            continue;
          }
          if (prog.type === 'special') {
            row.push(prog.code);
            continue;
          }
          if (prog.type === 'shift' && prog.shift) {
            row.push(`${prog.code} (${prog.shift.start}-${prog.shift.end})`);
          } else {
            row.push('');
          }
        }
        return row;
      });

      // ── Sheet 2: Horas y extras ──
      const horasHeaders = [
        'Trabajador/a',
        'RUT',
        'Cargo',
        'Área',
        'Sucursal',
        'Horas Contratadas/Sem',
        'Total Horas Período',
        'Horas Domingos',
        'Horas Feriados',
        'Semanas con Extras',
        'Horas Extra Período',
        'Recargo Dominical 30% (h)',
        'Días Trabajados',
        ...DAY_COUNTS.map((c) => c.label),
      ];
      // Una columna por semana (todas las personas tienen las mismas semanas)
      const allStats = filteredWorkers.map((w) => calcWorkerStats(w.id));
      const weekCols = allStats[0]?.weeks ?? [];
      const maxWeeks = weekCols.length;
      weekCols.forEach((wk) =>
        horasHeaders.push(`${wk.label} ${wk.range}${wk.nextPeriod ? ' (sigue próximo corte)' : ''}`)
      );

      const horasRows = filteredWorkers.map((worker, wIdx) => {
        const stats = allStats[wIdx];
        const row: (string | number)[] = [
          worker.name,
          worker.rut || '',
          worker.cargo || '',
          worker.area || '',
          worker.sucursal || '',
          stats.contractedWeekly,
          stats.totalHours,
          stats.sundayHours,
          stats.holidayHours,
          stats.overtimeWeeks.length,
          stats.totalOvertime,
          stats.recargoDominical,
          stats.diasTrabajados,
          ...DAY_COUNTS.map((c) => stats.dayCounts[c.key] ?? 0),
        ];
        for (let i = 0; i < maxWeeks; i++) {
          row.push(stats.weeks[i]?.hours ?? 0);
        }
        return row;
      });

      // ── Summary sheet ──
      const summaryData = [
        ['REPORTE RRHH', ''],
        ['Período', periodLabel],
        ['Sucursal', selectedSucursal],
        ['Área', selectedArea],
        ['Cargo', selectedCargo],
        ['Búsqueda', searchName || '—'],
        ['Total trabajadores', filteredWorkers.length],
        ['Fecha de exportación', new Date().toLocaleDateString('es-CL')],
      ];

      // ── Download ──
      const fileName = `RRHH_${(useRange ? `${periodStart}_a_${periodEnd}` : selectedMes).replace(/ /g, '_')}_${selectedSucursal !== 'Todas' ? selectedSucursal + '_' : ''}${selectedCargo !== 'Todos' ? selectedCargo + '_' : ''}export.xlsx`;
      await downloadSimpleWorkbook(
        [
          {
            name: 'Horario Programado',
            rows: [horarioHeaders, ...horarioRows],
            colWidths: [28, 14, 20, 16, 16, 12, ...Array(numDays).fill(17)],
          },
          {
            name: 'Horas y Extras',
            rows: [horasHeaders, ...horasRows],
            colWidths: [
              28,
              14,
              20,
              16,
              16,
              14,
              14,
              14,
              14,
              14,
              14,
              16,
              ...Array(1 + DAY_COUNTS.length).fill(14),
              ...Array(maxWeeks).fill(16),
            ],
          },
          { name: 'Resumen', rows: summaryData, colWidths: [24, 28], header: false },
        ],
        fileName
      );
    } catch (err) {
      console.error('Error exportando Excel:', err);
    } finally {
      setExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filteredWorkers,
    days,
    dayRecords,
    attendanceMap,
    periodLabel,
    selectedSucursal,
    selectedArea,
    selectedCargo,
    searchName,
  ]);

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <Users size={20} className="text-secondary" />
            Recursos Humanos
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">
            Control de horarios y horas trabajadas por colaborador/a
          </p>
        </div>
        {/* Export button */}
        <button
          onClick={handleExport}
          disabled={exporting || filteredWorkers.length === 0}
          className="flex items-center gap-2 bg-secondary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {exporting ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download size={16} />
          )}
          {exporting ? 'Exportando…' : 'Exportar Excel'}
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-wrap gap-4 items-end mb-5">
        {/* Período: mes o rango de fechas (cortes) */}
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Período
          </span>
          <div className="flex gap-1 bg-muted/40 rounded-lg p-1 w-fit">
            <button
              onClick={() => setPeriodMode('mes')}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${periodMode === 'mes' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              Mes
            </button>
            <button
              onClick={switchToRange}
              className={`px-3 py-1 rounded-md text-xs font-semibold ${periodMode === 'rango' ? 'bg-card shadow text-foreground' : 'text-muted-foreground'}`}
            >
              Rango de fechas
            </button>
          </div>
        </div>
        {periodMode === 'mes' ? (
          <div className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Mes
            </span>
            <select
              value={selectedMes}
              onChange={(e) => setSelectedMes(e.target.value)}
              className="pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
            >
              {MESES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
              Desde – Hasta
            </span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={rangeFrom}
                onChange={(e) => setRangeFrom(e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-muted-foreground text-sm">al</span>
              <input
                type="date"
                value={rangeTo}
                min={rangeFrom || undefined}
                onChange={(e) => setRangeTo(e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {!rangeValid && (
              <span className="text-[11px] text-amber-600">
                Elige una fecha de inicio y una de término (se muestra el mes mientras tanto).
              </span>
            )}
            {rangeTruncated && (
              <span className="text-[11px] text-amber-600">
                Máximo {MAX_RANGE_DAYS} días: se muestra hasta el {fmtDate(periodEnd)}.
              </span>
            )}
          </div>
        )}
        {/* Sucursal */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Sucursal
          </span>
          <select
            value={selectedSucursal}
            onChange={(e) => setSelectedSucursal(e.target.value)}
            className="pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            {sucursalOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        {/* Área */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Área
          </span>
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        {/* Cargo */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Cargo
          </span>
          <select
            value={selectedCargo}
            onChange={(e) => setSelectedCargo(e.target.value)}
            className="pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            {cargoOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {/* Buscador nombre */}
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Buscar trabajador/a
          </span>
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Nombre…"
              className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchName && (
              <button
                onClick={() => setSearchName('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
        {loadingAttendance && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground self-end pb-2">
            <div className="w-3 h-3 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
            Cargando asistencia…
          </div>
        )}
      </div>

      {/* Result count */}
      {(selectedCargo !== 'Todos' || searchName.trim()) && (
        <p className="text-xs text-muted-foreground mb-3">
          Mostrando <span className="font-semibold text-foreground">{filteredWorkers.length}</span>{' '}
          trabajador{filteredWorkers.length !== 1 ? 'es' : ''} filtrado
          {filteredWorkers.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-muted/40 rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('horario')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'horario' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          📅 Horario programado
        </button>
        <button
          onClick={() => setActiveTab('horas')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'horas' ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
        >
          ⏱️ Horas y extras
        </button>
      </div>

      {filteredWorkers.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center text-muted-foreground">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay trabajadores activos para los filtros seleccionados.</p>
        </div>
      ) : activeTab === 'horario' ? (
        /* ── HORARIO TAB ── */
        <div
          className="bg-card rounded-2xl border border-border overflow-x-auto"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/20 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-semibold text-foreground text-xs">Leyenda:</span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" />{' '}
              Inasistencia
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" />{' '}
              Tiempos reales ingresados
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" />{' '}
              Turno programado
            </span>
          </div>
          <table className="min-w-max w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 z-10 bg-muted/30 px-4 py-3 text-left font-semibold text-foreground min-w-[180px]">
                  Trabajador/a
                </th>
                {days.map((d, i) => {
                  const isSun = d.date.getDay() === 0;
                  const isSat = d.date.getDay() === 6;
                  const isFer = isFeriado(d.dateStr);
                  return (
                    <th
                      key={`hdr-${i}`}
                      className={`px-1 py-2 text-center font-semibold min-w-[90px] ${isSun ? 'text-red-600 bg-red-50/50' : isFer ? 'text-orange-600 bg-orange-50/50' : isSat ? 'text-blue-600' : 'text-muted-foreground'}`}
                    >
                      <div>{DOW_LABELS[d.date.getDay()]}</div>
                      <div className="font-bold text-foreground">
                        {d.day}
                        {useRange && (
                          <span className="font-normal text-muted-foreground">
                            /{d.date.getMonth() + 1}
                          </span>
                        )}
                      </div>
                      {isFer && <div className="text-[9px] text-orange-500">Feriado</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {filteredWorkers.map((worker) => (
                <tr key={`rrhh-row-${worker.id}`} className="hover:bg-muted/20 transition-colors">
                  <td className="sticky left-0 z-10 bg-card px-4 py-2 border-r border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                        {worker.initials}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-xs">{worker.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {worker.cargo} · {worker.horasContratadas}h
                        </p>
                      </div>
                    </div>
                  </td>
                  {days.map((d, dayIdx) => {
                    const prog = getProgrammedShift(worker.id, dayIdx);
                    const record = dayRecords[worker.id]?.[d.dateStr];
                    const att = getAttendanceForDay(worker.id, dayIdx);
                    // Descanso / no trabajaba en un día sin turno se ve como día libre normal
                    const isAbsent =
                      isDayOff(att) &&
                      (prog?.type === 'shift' || !['DESCANSO', 'NT'].includes(att?.status ?? ''));
                    const absentLabel =
                      !att || !isAbsent
                        ? ''
                        : att.status === 'AUSENTE'
                          ? 'AUSENTE'
                          : dayOffLabel(att).toUpperCase();
                    const isEditing =
                      editingCell?.workerId === worker.id && editingCell?.dayIdx === dayIdx;
                    const isSun = d.date.getDay() === 0;
                    const isFer = isFeriado(d.dateStr);

                    // Cell background: absent overrides sun/holiday tint
                    const cellBg = isAbsent
                      ? 'bg-red-50/60'
                      : isSun
                        ? 'bg-red-50/30'
                        : isFer
                          ? 'bg-orange-50/30'
                          : '';

                    if (isEditing) {
                      return (
                        <td
                          key={`cell-${worker.id}-${dayIdx}`}
                          className={`px-1 py-1 border-r border-border/50 ${cellBg}`}
                        >
                          <div className="bg-card border border-secondary rounded-lg p-2 shadow-lg min-w-[160px] z-30 relative">
                            <p className="text-[10px] font-bold text-secondary mb-2">
                              Día {fmtDate(d.dateStr)}
                            </p>
                            <div className="grid grid-cols-2 gap-1 mb-1">
                              <div>
                                <p className="text-[9px] text-muted-foreground mb-0.5">Entrada</p>
                                <TimeInput
                                  value={editBuffer.entradaReal}
                                  onChange={(v) => setEditBuffer((b) => ({ ...b, entradaReal: v }))}
                                />
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground mb-0.5">Salida</p>
                                <TimeInput
                                  value={editBuffer.salidaReal}
                                  onChange={(v) => setEditBuffer((b) => ({ ...b, salidaReal: v }))}
                                />
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground mb-0.5">
                                  Ent. Colación
                                </p>
                                <TimeInput
                                  value={editBuffer.entradaColacion}
                                  onChange={(v) =>
                                    setEditBuffer((b) => ({ ...b, entradaColacion: v }))
                                  }
                                />
                              </div>
                              <div>
                                <p className="text-[9px] text-muted-foreground mb-0.5">
                                  Sal. Colación
                                </p>
                                <TimeInput
                                  value={editBuffer.salidaColacion}
                                  onChange={(v) =>
                                    setEditBuffer((b) => ({ ...b, salidaColacion: v }))
                                  }
                                />
                              </div>
                            </div>
                            <div className="flex gap-1 mt-1">
                              <button
                                onClick={saveEdit}
                                className="flex-1 flex items-center justify-center gap-1 bg-secondary text-white rounded px-2 py-1 text-[10px] font-bold hover:bg-blue-700 transition-colors"
                              >
                                <Save size={10} /> Guardar
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="flex items-center justify-center p-1 rounded border border-border hover:bg-muted/50 transition-colors"
                              >
                                <X size={10} className="text-muted-foreground" />
                              </button>
                            </div>
                          </div>
                        </td>
                      );
                    }

                    // ── ABSENT cell: show programmed shift + AUSENTE badge + reason ──
                    if (isAbsent && prog?.type === 'shift' && prog.shift) {
                      return (
                        <td
                          key={`cell-${worker.id}-${dayIdx}`}
                          className={`px-1 py-1 border-r border-border/50 text-center ${cellBg}`}
                          title={
                            att?.absenceReason ? `Motivo: ${att.absenceReason}` : 'Inasistencia'
                          }
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            {/* Programmed shift (greyed out to show what was planned) */}
                            <span
                              className={`text-[9px] font-semibold px-1 rounded opacity-50 ${prog.shift.colorClass}`}
                            >
                              {prog.code}
                            </span>
                            <span className="text-[8px] text-muted-foreground/60 line-through">
                              {prog.shift.start}–{prog.shift.end}
                            </span>
                            {/* Absent badge */}
                            <span className="bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none mt-0.5">
                              {absentLabel}
                            </span>
                            {/* Reason */}
                            {att?.absenceReason && (
                              <span
                                className="text-[8px] text-red-600 font-medium max-w-[80px] truncate leading-tight"
                                title={att.absenceReason}
                              >
                                {att.absenceReason}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // ── ABSENT but no shift programmed ──
                    if (isAbsent) {
                      return (
                        <td
                          key={`cell-${worker.id}-${dayIdx}`}
                          className={`px-1 py-1 border-r border-border/50 text-center ${cellBg}`}
                          title={
                            att?.absenceReason ? `Motivo: ${att.absenceReason}` : 'Inasistencia'
                          }
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <AlertCircle size={12} className="text-red-500" />
                            <span className="bg-red-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                              {absentLabel}
                            </span>
                            {att?.absenceReason && (
                              <span
                                className="text-[8px] text-red-600 font-medium max-w-[80px] truncate"
                                title={att.absenceReason}
                              >
                                {att.absenceReason}
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    }

                    // ── Normal cell ──
                    return (
                      <td
                        key={`cell-${worker.id}-${dayIdx}`}
                        className={`px-1 py-1 border-r border-border/50 text-center cursor-pointer hover:bg-muted/30 transition-colors ${cellBg}`}
                        onClick={() => startEdit(worker.id, dayIdx)}
                        title="Clic para editar tiempos reales"
                      >
                        {prog?.type === 'special' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[11px]">📋</span>
                            <span className="text-[9px] text-muted-foreground">
                              {prog.code.slice(0, 4)}
                            </span>
                          </div>
                        ) : prog?.type === 'desc' ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="text-[11px]">😴</span>
                            <span className="text-[9px] text-slate-400">DESC</span>
                          </div>
                        ) : prog?.type === 'shift' && prog.shift ? (
                          <div className="flex flex-col items-center gap-0.5">
                            {record ? (
                              <>
                                <span className="text-[10px] font-bold text-green-700">
                                  {record.entradaReal}
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  → {record.salidaReal}
                                </span>
                                {record.entradaColacion && (
                                  <span className="text-[8px] text-orange-500">
                                    🍽 {record.entradaColacion}-{record.salidaColacion}
                                  </span>
                                )}
                                <Edit3 size={8} className="text-secondary opacity-60" />
                              </>
                            ) : (
                              <>
                                <span
                                  className={`text-[10px] font-bold px-1 rounded ${prog.shift.colorClass}`}
                                >
                                  {prog.code}
                                </span>
                                <span className="text-[9px] text-muted-foreground whitespace-nowrap">
                                  {prog.shift.start}–{prog.shift.end}
                                </span>
                                <Edit3 size={8} className="text-muted-foreground/40" />
                              </>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/30 text-[10px]">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── HORAS TAB ── */
        <div className="space-y-3">
          {filteredWorkers.map((worker) => {
            const stats = calcWorkerStats(worker.id);
            return (
              <div
                key={`hrs-${worker.id}`}
                className="bg-card rounded-xl border border-border p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-sm font-bold shrink-0">
                    {worker.initials}
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">{worker.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {worker.cargo} · {worker.area} · {worker.horasContratadas}h contratadas/semana
                    </p>
                  </div>
                  <div className="ml-auto flex gap-2 text-center flex-wrap justify-end">
                    <div className="bg-muted/40 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Total período
                      </p>
                      <p className="text-lg font-bold text-foreground">{stats.totalHours}h</p>
                    </div>
                    <div
                      className={`rounded-lg px-3 py-2 ${stats.sundayHours > 0 ? 'bg-red-50 border border-red-100' : 'bg-muted/40'}`}
                    >
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Sun size={10} /> Domingos
                      </p>
                      <p
                        className={`text-lg font-bold ${stats.sundayHours > 0 ? 'text-red-600' : 'text-foreground'}`}
                      >
                        {stats.sundayHours}h
                      </p>
                    </div>
                    {stats.sundaySurcharge > 0 && (
                      <div className="bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-orange-600 uppercase tracking-wider">
                          Recargo Dom.
                        </p>
                        <p className="text-lg font-bold text-orange-600">
                          +{stats.sundaySurcharge}h
                        </p>
                      </div>
                    )}
                    <div
                      className={`rounded-lg px-3 py-2 ${stats.holidayHours > 0 ? 'bg-orange-50 border border-orange-100' : 'bg-muted/40'}`}
                    >
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Star size={10} /> Feriados
                      </p>
                      <p
                        className={`text-lg font-bold ${stats.holidayHours > 0 ? 'text-orange-600' : 'text-foreground'}`}
                      >
                        {stats.holidayHours}h
                      </p>
                    </div>
                    <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        Recargo dominical (30%)
                      </p>
                      <p className="text-lg font-bold text-purple-600">{stats.recargoDominical}h</p>
                    </div>
                    {stats.totalOvertimeHours > 0 && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          Recargo HE (50%)
                        </p>
                        <p className="text-lg font-bold text-indigo-600">{stats.recargoHE}h</p>
                      </div>
                    )}
                    {stats.totalOvertime > 0 && (
                      <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-red-600 uppercase tracking-wider">
                          HE Total
                        </p>
                        <p className="text-lg font-bold text-red-600">+{stats.totalOvertime}h</p>
                      </div>
                    )}
                  </div>
                </div>
                {/* Weekly breakdown */}
                <div className="flex flex-wrap gap-2">
                  {stats.weeks.map((wk, idx) => {
                    const isOver = wk.overtime > 0;
                    const isUnder =
                      !wk.nextPeriod && wk.hours > 0 && wk.hours < stats.contractedWeekly;
                    return (
                      <div
                        key={`wk-${worker.id}-${idx}`}
                        className={`flex flex-col items-center px-3 py-2 rounded-lg border text-xs min-w-[70px] ${
                          wk.nextPeriod
                            ? 'bg-muted/30 border-dashed border-border text-muted-foreground'
                            : isOver
                              ? 'bg-red-50 border-red-200 text-red-700'
                              : isUnder
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : wk.hours === 0
                                  ? 'bg-muted/30 border-border text-muted-foreground'
                                  : 'bg-green-50 border-green-200 text-green-700'
                        }`}
                      >
                        <span className="font-bold text-sm">{wk.label}</span>
                        <span className="text-[9px] opacity-80">{wk.range}</span>
                        <span className="font-semibold">{wk.hours}h</span>
                        {wk.fromPrev && (
                          <span
                            className="text-[9px]"
                            title="Incluye días antes del inicio del período"
                          >
                            incluye días previos
                          </span>
                        )}
                        {wk.nextPeriod && (
                          <span
                            className="text-[9px]"
                            title="La semana termina después del período"
                          >
                            sigue en el próximo corte
                          </span>
                        )}
                        {isOver && (
                          <span className="text-[9px] font-bold">+{wk.overtime}h extra</span>
                        )}
                        {isUnder && (
                          <span className="text-[9px]">
                            ↓ {Math.round((stats.contractedWeekly - wk.hours) * 10) / 10}h
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {stats.overtimeWeeks.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-xs text-red-700">
                    <Clock size={12} />
                    <span className="font-semibold">Horas extras:</span>
                    {stats.overtimeWeeks.map((wk, i) => (
                      <span key={`ot-${i}`} className="bg-red-100 rounded px-1.5 py-0.5 font-bold">
                        {wk.label}: +{wk.overtime}h
                      </span>
                    ))}
                  </div>
                )}
                {/* Días del período (para descuentos) */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-foreground">Días del período:</span>
                  <span className="bg-green-50 border border-green-200 text-green-700 rounded px-2 py-0.5 font-semibold">
                    Trabajados: {stats.diasTrabajados}
                  </span>
                  {DAY_COUNTS.filter(
                    (c) => c.key === 'faltaInj' || (stats.dayCounts[c.key] ?? 0) > 0
                  ).map((c) => (
                    <span
                      key={c.key}
                      className={`rounded px-2 py-0.5 font-semibold border ${
                        c.key === 'faltaInj' && (stats.dayCounts[c.key] ?? 0) > 0
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : 'bg-muted/40 border-border text-foreground'
                      }`}
                    >
                      {c.label}: {stats.dayCounts[c.key] ?? 0}
                    </span>
                  ))}
                </div>
                {/* Weekly summary */}
                <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-muted-foreground text-[10px]">Horas/semana contratadas</p>
                    <p className="font-bold text-foreground">{stats.contractedWeekly}h</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-muted-foreground text-[10px]">Semanas con extras</p>
                    <p
                      className={`font-bold ${stats.overtimeWeeks.length > 0 ? 'text-red-600' : 'text-foreground'}`}
                    >
                      {stats.overtimeWeeks.length}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-muted-foreground text-[10px]">Total HE período</p>
                    <p
                      className={`font-bold ${stats.totalOvertime > 0 ? 'text-red-600' : 'text-foreground'}`}
                    >
                      {stats.totalOvertime > 0 ? `+${stats.totalOvertime}h` : '0h'}
                    </p>
                  </div>
                  <div className="bg-muted/30 rounded-lg px-2 py-1.5 text-center">
                    <p className="text-muted-foreground text-[10px]">Recargo dominical</p>
                    <p
                      className={`font-bold ${stats.sundaySurcharge > 0 ? 'text-orange-600' : 'text-foreground'}`}
                    >
                      {stats.sundaySurcharge > 0 ? `+${stats.sundaySurcharge}h` : '0h'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

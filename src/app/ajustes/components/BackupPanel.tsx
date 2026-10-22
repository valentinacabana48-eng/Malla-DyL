'use client';
import React, { useEffect, useState } from 'react';
import { DatabaseBackup, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import ExcelJS from 'exceljs';
import { getSupabase } from '@/lib/supabase/client';

// Respaldo de toda la base de datos en un Excel: una hoja por tabla, con todas sus filas.
// Las columnas con listas u objetos (p. ej. los días de la malla) van como texto JSON,
// así el archivo sirve para volver a cargar los datos si algún día se pierden.
// No incluye las claves de Mis turnos (worker_pins, worker_sessions): son secretas.

const TABLES: { table: string; sheet: string; order: string[] }[] = [
  { table: 'workers', sheet: 'Trabajadoras', order: ['id'] },
  { table: 'shifts', sheet: 'Turnos', order: ['code'] },
  { table: 'sucursales', sheet: 'Sucursales', order: ['name'] },
  { table: 'areas', sheet: 'Áreas', order: ['name'] },
  { table: 'area_cargos', sheet: 'Cargos por área', order: ['area_name'] },
  { table: 'custom_non_working_types', sheet: 'Tipos de día', order: ['code'] },
  { table: 'schedule_data', sheet: 'Malla', order: ['id'] },
  { table: 'special_days_v2', sheet: 'Días especiales', order: ['id'] },
  { table: 'special_days', sheet: 'Días especiales (antiguo)', order: ['id'] },
  { table: 'published_schedules', sheet: 'Publicaciones', order: ['month_key', 'sucursal'] },
  { table: 'published_schedule_days', sheet: 'Malla publicada', order: ['month_key', 'worker_id'] },
  { table: 'attendance_records', sheet: 'Asistencia', order: ['id'] },
  { table: 'attendance_locked_dates', sheet: 'Asistencia bloqueada', order: ['id'] },
  {
    table: 'attendance_proposals',
    sheet: 'Asistencia propuesta',
    order: ['worker_id', 'record_date'],
  },
  { table: 'attendance_reports', sheet: 'Reportes de asistencia', order: ['id'] },
  { table: 'overtime_hours', sheet: 'Horas extra', order: ['id'] },
  { table: 'rrhh_time_records', sheet: 'RRHH', order: ['id'] },
  { table: 'shift_requests', sheet: 'Solicitudes', order: ['id'] },
  { table: 'user_roles', sheet: 'Usuarios', order: ['user_id'] },
  { table: 'app_settings', sheet: 'Configuración', order: ['key'] },
];

const PAGE = 1000;
const LAST_KEY = 'dyl_ultimo_respaldo';

type Row = Record<string, unknown>;

async function fetchAll(t: (typeof TABLES)[number]): Promise<Row[]> {
  const supabase = getSupabase();
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(t.table).select('*');
    t.order.forEach((col) => (q = q.order(col)));
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...((data as Row[]) ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

const cellValue = (v: unknown) =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : v;

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export default function BackupPanel() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ ok: number; rows: number; failed: string[] } | null>(null);
  const [last, setLast] = useState<string | null>(null);

  useEffect(() => {
    try {
      setLast(localStorage.getItem(LAST_KEY));
    } catch {
      // sin almacenamiento: no se muestra la fecha del último respaldo
    }
  }, []);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DyL Gestor';
    const summary = wb.addWorksheet('Resumen');
    const now = new Date();
    summary.addRow(['Respaldo de DyL Gestor']).font = { bold: true, size: 14 };
    summary.addRow([`Descargado el ${now.toLocaleString('es-CL')}`]);
    summary.addRow([]);
    summary.addRow(['Hoja', 'Tabla', 'Filas', 'Estado']).font = { bold: true };
    summary.columns = [{ width: 28 }, { width: 28 }, { width: 10 }, { width: 40 }];

    let ok = 0;
    let total = 0;
    const failed: string[] = [];
    for (const [i, t] of TABLES.entries()) {
      setProgress(`${t.sheet} (${i + 1} de ${TABLES.length})`);
      try {
        const rows = await fetchAll(t);
        const ws = wb.addWorksheet(t.sheet);
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        if (cols.length) {
          ws.addRow(cols).font = { bold: true };
          rows.forEach((r) => ws.addRow(cols.map((c) => cellValue(r[c]))));
          ws.views = [{ state: 'frozen', ySplit: 1 }];
          ws.columns.forEach((col) => (col.width = 18));
        } else {
          ws.addRow(['(sin datos)']);
        }
        summary.addRow([t.sheet, t.table, rows.length, 'OK']);
        ok++;
        total += rows.length;
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? 'error';
        summary.addRow([t.sheet, t.table, '', `No se pudo leer: ${msg}`]);
        failed.push(t.sheet);
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `Respaldo_DyL_${stamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    if (failed.length < TABLES.length) {
      const iso = now.toISOString();
      try {
        localStorage.setItem(LAST_KEY, iso);
      } catch {
        // sin almacenamiento: no se recuerda la fecha
      }
      setLast(iso);
    }
    setResult({ ok, rows: total, failed });
    setProgress('');
    setBusy(false);
  };

  const ago = last ? daysAgo(last) : null;
  const overdue = ago === null || ago >= 7;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <DatabaseBackup size={20} className="text-blue-700" />
        </div>
        <div>
          <h2 className="text-base font-bold text-foreground">Respaldo de los datos</h2>
          <p className="text-sm text-muted-foreground">
            Descarga un Excel con todo lo guardado en la app: trabajadoras, turnos, mallas,
            asistencia, horas extra, solicitudes y usuarios, una hoja por cada cosa. Guárdalo en tu
            computador o en Drive una vez por semana. Si algún día se pierde algo, con este archivo
            se puede volver a cargar.
          </p>
        </div>
      </div>

      <p
        className={`text-sm rounded-xl px-3 py-2 ${
          overdue ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'
        }`}
      >
        {ago === null
          ? 'Todavía no has descargado un respaldo en este equipo.'
          : ago === 0
            ? 'Último respaldo: hoy.'
            : `Último respaldo: hace ${ago} día${ago === 1 ? '' : 's'}.`}
        {overdue && ago !== null && ' Toca descargar uno nuevo.'}
      </p>

      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="self-start flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
      >
        <Download size={16} />
        {busy ? `Preparando… ${progress}` : 'Descargar respaldo'}
      </button>

      {result && (
        <div
          className={`text-sm rounded-xl px-3 py-2 flex items-start gap-2 ${
            result.failed.length ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'
          }`}
        >
          {result.failed.length ? (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          )}
          <span>
            Listo: {result.ok} hojas con {result.rows.toLocaleString('es-CL')} filas en total.
            {result.failed.length > 0 &&
              ` No se pudo leer: ${result.failed.join(', ')} (lo anoté en la hoja Resumen).`}
          </span>
        </div>
      )}
    </div>
  );
}

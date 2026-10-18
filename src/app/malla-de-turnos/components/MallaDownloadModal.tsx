'use client';
import React, { useState, useMemo } from 'react';
import { X, FileSpreadsheet, Download, Calendar, CalendarRange } from 'lucide-react';
import ExcelJS from 'exceljs';
import { type Worker, type Shift, type ShiftCode, type ScheduleData, type SpecialDaysData, MESES,  } from '@/context/AppContext';

interface Props {
  workers: Worker[];
  scheduleData: ScheduleData;
  specialDays: SpecialDaysData;
  shifts: Record<string, Shift>;
  currentMonth: string;
  onClose: () => void;
}

// ─── Color palette (same as MallaExcelPanel) ─────────────────────────────────
const C = {
  headerBg:   '1E40AF',
  headerFg:   'FFFFFF',
  white:      'FFFFFFFF',
  rowEven:    'FFFFFF',
  rowOdd:     'EFF6FF',
  satBg:      'E0E7FF',
  sunBg:      'C7D2FE',
  satHdrBg:   '93C5FD',
  sunHdrBg:   '60A5FA',
  sumHdrBg:   '1E40AF',
  descBg:     'DBEAFE',
  feriBg:     'FEE2E2',
  vacaBg:     'D1FAE5',
  liceBg:     'FEF3C7',
  permBg:     'E0E7FF',
  cumpBg:     'F3E8FF',
};

type FillArg = ExcelJS.Fill;

function solidFill(hex: string): FillArg {
  const clean = hex.replace('#', '').padEnd(8, 'F').slice(0, 8);
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: clean.length === 6 ? 'FF' + clean : clean } };
}

function applyCell(
  cell: ExcelJS.Cell,
  value: string | number | null,
  opts: {
    bgArgb?: string;
    fgArgb?: string;
    bold?: boolean;
    sz?: number;
    halign?: ExcelJS.Alignment['horizontal'];
  }
) {
  cell.value = value ?? '';
  if (opts.bgArgb) {
    const argb = opts.bgArgb.length === 6 ? 'FF' + opts.bgArgb : opts.bgArgb.replace('#', '');
    cell.fill = solidFill(argb);
  }
  cell.font = {
    name: 'Calibri',
    size: opts.sz ?? 9,
    bold: opts.bold ?? false,
    color: { argb: opts.fgArgb ? (opts.fgArgb.length === 6 ? 'FF' + opts.fgArgb : opts.fgArgb) : 'FF000000' },
  };
  cell.alignment = {
    horizontal: opts.halign ?? 'center',
    vertical: 'middle',
    wrapText: false,
  };
  const bc = { style: 'thin' as const, color: { argb: 'FFB8CCE4' } };
  cell.border = { top: bc, bottom: bc, left: bc, right: bc };
}

function getShiftHours(code: string, shifts: Record<string, Shift>): number {
  const shiftInfo = shifts[code];
  if (!shiftInfo?.start || !shiftInfo?.end) return 0;
  const [sh, sm] = shiftInfo.start.split(':').map(Number);
  const [eh, em] = shiftInfo.end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  let hrs = mins / 60;
  if ((shiftInfo as { colacion?: number }).colacion) {
    hrs -= ((shiftInfo as { colacion?: number }).colacion! / 60);
  }
  return hrs;
}

// Build list of days from startDate to endDate (inclusive)
function buildDayList(startDate: Date, endDate: Date): Date[] {
  let days: Date[] = [];
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// monthLabel like "Agosto 2026" → "2026-08"
function dateToMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const DOW_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const DAY_NAMES_MAP: Record<string, string> = {
  L: 'lun', M: 'mar', J: 'jue', V: 'vie', S: 'sáb', D: 'dom',
};

async function exportToExcel(
  workers: Worker[],
  scheduleData: ScheduleData,
  specialDays: SpecialDaysData,
  shifts: Record<string, Shift>,
  days: Date[],
  fileName: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DL Gestor';
  wb.created = new Date();

  const FIXED_COLS = 2; // NOMBRE, JORNADA

  const ws = wb.addWorksheet('Malla de Turnos', {
    views: [{ state: 'frozen', xSplit: FIXED_COLS, ySplit: 2 }],
  });

  const totalCols = FIXED_COLS + days.length;

  // Column widths
  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 9;
  for (let d = 0; d < days.length; d++) {
    ws.getColumn(FIXED_COLS + 1 + d).width = 13;
  }

  // ── ROW 1: Day-of-week names ──────────────────────────────────────────────
  ws.getRow(1).height = 15;
  applyCell(ws.getCell(1, 1), '', { bgArgb: C.headerBg, fgArgb: C.headerFg, bold: true });
  applyCell(ws.getCell(1, 2), '', { bgArgb: C.headerBg, fgArgb: C.headerFg, bold: true });

  for (let d = 0; d < days.length; d++) {
    const date = days[d];
    const dow = DOW_LETTERS[date.getDay()];
    const isSat = dow === 'S';
    const isSun = dow === 'D';
    let bg = isSun ? C.sunHdrBg : isSat ? C.satHdrBg : C.headerBg;
    let fg = isSun ? '1E3A8A' : isSat ? '1E3A8A' : C.headerFg;
    applyCell(ws.getCell(1, FIXED_COLS + 1 + d), DAY_NAMES_MAP[dow] || dow.toLowerCase(), {
      bgArgb: bg, fgArgb: fg, sz: 9,
    });
  }

  // ── ROW 2: Fixed headers + date strings ───────────────────────────────────
  ws.getRow(2).height = 18;
  applyCell(ws.getCell(2, 1), 'NOMBRE', { bgArgb: C.headerBg, fgArgb: C.headerFg, bold: true, sz: 10, halign: 'center' });
  applyCell(ws.getCell(2, 2), 'Jornada', { bgArgb: C.headerBg, fgArgb: C.headerFg, bold: true, sz: 10, halign: 'center' });

  for (let d = 0; d < days.length; d++) {
    const date = days[d];
    const dow = DOW_LETTERS[date.getDay()];
    const isSat = dow === 'S';
    const isSun = dow === 'D';
    let bg = isSun ? C.sunHdrBg : isSat ? C.satHdrBg : C.headerBg;
    let fg = isSun ? '1E3A8A' : isSat ? '1E3A8A' : C.headerFg;
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    applyCell(ws.getCell(2, FIXED_COLS + 1 + d), `${dd}-${mm}-${yyyy}`, {
      bgArgb: bg, fgArgb: fg, bold: true, sz: 9, halign: 'center',
    });
  }

  // ── Data rows ─────────────────────────────────────────────────────────────
  let currentRow = 3;

  // Per-day shift counts for summary
  const shiftCountsPerDay: Record<number, Record<string, number>> = {};
  for (let d = 0; d < days.length; d++) shiftCountsPerDay[d] = {};

  for (let wi = 0; wi < workers.length; wi++) {
    const worker = workers[wi];
    const isEven = wi % 2 === 0;
    const rowBg = isEven ? C.rowEven : C.rowOdd;
    ws.getRow(currentRow).height = 16;

    applyCell(ws.getCell(currentRow, 1), worker.name, {
      bgArgb: rowBg, fgArgb: '1A1A1A', bold: true, sz: 10, halign: 'left',
    });
    applyCell(ws.getCell(currentRow, 2), worker.horasContratadas ?? 42, {
      bgArgb: rowBg, fgArgb: '1A1A1A', bold: true, sz: 9, halign: 'center',
    });

    for (let d = 0; d < days.length; d++) {
      const date = days[d];
      const monthKey = dateToMonthKey(date);
      const dayIndex = date.getDate() - 1;

      const monthSchedule = scheduleData[monthKey] || {};
      const monthSpecialDays = specialDays[monthKey] || {};
      const sched = monthSchedule[worker.id] || [];
      const workerSpecialDays = monthSpecialDays[worker.id] || {};

      const dow = DOW_LETTERS[date.getDay()];
      const isSun = dow === 'D';
      const isSat = dow === 'S';
      let bg = isSun ? C.sunBg : isSat ? C.satBg : rowBg;

      const special = workerSpecialDays[dayIndex];
      const shiftCode = sched[dayIndex];

      let displayVal = '';
      let fg = '1A1A1A';
      let bold = false;

      if (special) {
        const code = special.slice(0, 4).toUpperCase();
        if (code === 'DESC') { displayVal = 'DESCANSO'; fg = '3B82F6'; bg = C.descBg; }
        else if (code === 'VACA') { displayVal = 'VACACIONES'; fg = '065F46'; bold = true; bg = C.vacaBg; }
        else if (code === 'LICE') { displayVal = 'LICENCIA'; fg = '92400E'; bold = true; bg = C.liceBg; }
        else if (code === 'PERM') { displayVal = 'PERMISO'; fg = '3730A3'; bold = true; bg = C.permBg; }
        else if (code === 'FERI') { displayVal = 'FERIADO'; fg = 'B91C1C'; bold = true; bg = C.feriBg; }
        else if (code === 'CUMP') { displayVal = 'CUMPLEAÑOS'; fg = '7C3AED'; bold = true; bg = C.cumpBg; }
        else { displayVal = special; bold = true; }

        // Count for summary
        shiftCountsPerDay[d][displayVal] = (shiftCountsPerDay[d][displayVal] || 0) + 1;
      } else if (shiftCode) {
        const shiftInfo = shifts[shiftCode as string];
        if (shiftInfo?.start && shiftInfo?.end) {
          displayVal = `${shiftInfo.start} - ${shiftInfo.end}`;
        } else {
          displayVal = String(shiftCode).toUpperCase();
        }
        fg = '1A1A1A';

        // Count for summary
        const countKey = String(shiftCode).toUpperCase();
        shiftCountsPerDay[d][countKey] = (shiftCountsPerDay[d][countKey] || 0) + 1;
      }

      applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), displayVal, {
        bgArgb: bg, fgArgb: fg, bold, sz: 9, halign: 'center',
      });
    }

    currentRow++;
  }

  // ── Blank separator ───────────────────────────────────────────────────────
  ws.getRow(currentRow).height = 8;
  currentRow++;

  // ── Summary section ───────────────────────────────────────────────────────
  ws.getRow(currentRow).height = 18;
  applyCell(ws.getCell(currentRow, 1), 'TURNO', {
    bgArgb: C.sumHdrBg, fgArgb: 'FFFFFF', bold: true, sz: 9, halign: 'left',
  });
  applyCell(ws.getCell(currentRow, 2), '', {
    bgArgb: C.sumHdrBg, fgArgb: 'FFFFFF', bold: true, sz: 9,
  });
  for (let d = 0; d < days.length; d++) {
    const date = days[d];
    applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), date.getDate(), {
      bgArgb: C.sumHdrBg, fgArgb: 'FFFFFF', bold: true, sz: 9,
    });
  }
  currentRow++;

  const allCodes = new Set<string>();
  for (let d = 0; d < days.length; d++) Object.keys(shiftCountsPerDay[d]).forEach(c => allCodes.add(c));
  const summaryCodes = Array.from(allCodes).sort();

  for (const code of summaryCodes) {
    ws.getRow(currentRow).height = 15;
    applyCell(ws.getCell(currentRow, 1), code, {
      bgArgb: 'FFFFFF', fgArgb: '1A1A1A', bold: true, sz: 9, halign: 'left',
    });
    applyCell(ws.getCell(currentRow, 2), '', { bgArgb: 'FFFFFF', fgArgb: '1A1A1A', sz: 9 });
    for (let d = 0; d < days.length; d++) {
      const count = shiftCountsPerDay[d][code] || 0;
      applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), count > 0 ? count : '', {
        bgArgb: 'FFFFFF', fgArgb: '1A1A1A', bold: count > 0, sz: 9,
      });
    }
    currentRow++;
  }

  // Total row
  ws.getRow(currentRow).height = 18;
  applyCell(ws.getCell(currentRow, 1), 'TOTAL TRABAJADORES', {
    bgArgb: C.sumHdrBg, fgArgb: 'FFFFFF', bold: true, sz: 9, halign: 'left',
  });
  applyCell(ws.getCell(currentRow, 2), '', { bgArgb: C.sumHdrBg, fgArgb: 'FFFFFF', bold: true, sz: 9 });
  for (let d = 0; d < days.length; d++) {
    const dayTotal = Object.values(shiftCountsPerDay[d]).reduce((a, b) => a + b, 0);
    applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), dayTotal, {
      bgArgb: C.sumHdrBg, fgArgb: 'FFFFFF', bold: true, sz: 9,
    });
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Month label → Date range ─────────────────────────────────────────────────
function monthLabelToDateRange(monthLabel: string): { start: Date; end: Date } {
  const MONTH_NAMES: Record<string, number> = {
    'Enero': 0, 'Febrero': 1, 'Marzo': 2, 'Abril': 3, 'Mayo': 4, 'Junio': 5,
    'Julio': 6, 'Agosto': 7, 'Septiembre': 8, 'Octubre': 9, 'Noviembre': 10, 'Diciembre': 11,
  };
  const parts = monthLabel.split(' ');
  const monthIdx = MONTH_NAMES[parts[0]] ?? 0;
  const year = parseInt(parts[1] || '2026', 10);
  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 0);
  return { start, end };
}

export default function MallaDownloadModal({
  workers, scheduleData, specialDays, shifts, currentMonth, onClose,
}: Props) {
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [startDate, setStartDate] = useState(() => {
    const { start } = monthLabelToDateRange(currentMonth);
    return start.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    const { end } = monthLabelToDateRange(currentMonth);
    return end.toISOString().slice(0, 10);
  });
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setExporting(true);
    try {
      let days: Date[];
      let fileName: string;

      if (mode === 'month') {
        const { start, end } = monthLabelToDateRange(selectedMonth);
        days = buildDayList(start, end);
        fileName = `Malla_${selectedMonth.replace(/\s+/g, '_')}.xlsx`;
      } else {
        const start = new Date(startDate + 'T00:00:00');
        const end = new Date(endDate + 'T00:00:00');
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          setError('Fechas inválidas. Por favor verifica el rango.');
          setExporting(false);
          return;
        }
        if (end < start) {
          setError('La fecha de fin debe ser igual o posterior a la fecha de inicio.');
          setExporting(false);
          return;
        }
        const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 366) {
          setError('El rango no puede superar 366 días.');
          setExporting(false);
          return;
        }
        days = buildDayList(start, end);
        const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
        fileName = `Malla_${fmt(start)}_al_${fmt(end)}.xlsx`;
      }

      await exportToExcel(workers, scheduleData, specialDays, shifts, days, fileName);
    } catch (e) {
      setError('Error al generar el archivo. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-teal-600 to-emerald-600">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={22} className="text-white" />
            <div>
              <h2 className="text-base font-bold text-white">Descargar Malla</h2>
              <p className="text-teal-100 text-xs">Exportar turnos a Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors rounded-lg p-1 hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Mode selector */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('month')}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                mode === 'month' ?'border-teal-500 bg-teal-50 text-teal-700' :'border-border bg-muted/30 text-muted-foreground hover:border-teal-300 hover:bg-teal-50/50'
              }`}
            >
              <Calendar size={20} />
              Mes completo
            </button>
            <button
              onClick={() => setMode('range')}
              className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-all ${
                mode === 'range' ?'border-teal-500 bg-teal-50 text-teal-700' :'border-border bg-muted/30 text-muted-foreground hover:border-teal-300 hover:bg-teal-50/50'
              }`}
            >
              <CalendarRange size={20} />
              Rango de fechas
            </button>
          </div>

          {/* Month selector */}
          {mode === 'month' && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Seleccionar mes
              </label>
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {MESES.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          )}

          {/* Date range selector */}
          {mode === 'range' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Fecha de inicio
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Fecha de fin
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Máximo 366 días por exportación.
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-semibold transition-colors active:scale-95"
          >
            {exporting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Generando Excel...
              </>
            ) : (
              <>
                <Download size={16} />
                Descargar Excel
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

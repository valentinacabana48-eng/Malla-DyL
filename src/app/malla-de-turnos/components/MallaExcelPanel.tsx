'use client';
import React, { useRef, useState } from 'react';
import { Download, Upload, X, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import ExcelJS from 'exceljs';
import { readFirstSheetRows } from '@/lib/excel';
import { type Worker, type Shift, type ShiftCode } from '@/context/AppContext';

interface Props {
  workers: Worker[];
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
  shifts: Record<string, Shift>;
  daysInMonth: number;
  daysOfWeek: string[];
  monthLabel: string;
  onImport: (workerId: string, dayIndex: number, shift: ShiftCode) => void;
  onClose: () => void;
}

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  headerBg: '1E40AF', // blue header background
  headerFg: 'FFFFFF', // white text on headers
  subHeaderBg: '2563EB', // slightly lighter blue for sub-rows
  subHeaderFg: 'FFFFFF',
  white: 'FFFFFFFF',
  rowEven: 'FFFFFF',
  rowOdd: 'EFF6FF',
  satBg: 'E0E7FF', // light indigo for saturday
  sunBg: 'C7D2FE', // slightly darker indigo for sunday
  satHdrBg: '93C5FD', // saturday header shade
  sunHdrBg: '60A5FA', // sunday header shade
  descBg: 'DBEAFE',
  descFg: '3B82F6',
  vacaBg: 'D1FAE5',
  vacaFg: '065F46',
  liceBg: 'FEF3C7',
  liceFg: '92400E',
  permBg: 'E0E7FF',
  permFg: '3730A3',
  feriBg: 'FEE2E2',
  feriFg: 'B91C1C',
  cumpBg: 'F3E8FF',
  cumpFg: '7C3AED',
  sumHdrBg: '1E40AF',
  sumRowBg: 'F5F5F5',
  sumTotBg: 'E8E8E8',
  borderColor: 'CCCCCC',
};

// Shift cells — plain white/near-white, dark text
const SHIFT_PALETTE = [
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
  { bg: 'FFFFFF', fg: '1A1A1A' },
];

type FillArg = ExcelJS.Fill;
type BorderStyle =
  | 'thin'
  | 'medium'
  | 'hair'
  | 'dotted'
  | 'dashDot'
  | 'dashDotDot'
  | 'slantDashDot'
  | 'mediumDashed'
  | 'mediumDashDot'
  | 'mediumDashDotDot'
  | 'double'
  | 'thick';

function solidFill(hex: string): FillArg {
  const clean = hex.replace('#', '').padEnd(8, 'F').slice(0, 8);
  return {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: clean.length === 6 ? 'FF' + clean : clean },
  };
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
    border?: BorderStyle;
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
    color: {
      argb: opts.fgArgb
        ? opts.fgArgb.length === 6
          ? 'FF' + opts.fgArgb
          : opts.fgArgb
        : 'FF000000',
    },
  };
  cell.alignment = {
    horizontal: opts.halign ?? 'center',
    vertical: 'middle',
    wrapText: false,
  };
  const bs: BorderStyle = opts.border ?? 'thin';
  const bc = { style: bs, color: { argb: 'FFB8CCE4' } };
  cell.border = { top: bc, bottom: bc, left: bc, right: bc };
}

export default function MallaExcelPanel({
  workers,
  scheduleData,
  specialDaysData,
  shifts,
  daysInMonth,
  daysOfWeek,
  monthLabel,
  onImport,
  onClose,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // ─── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DL Gestor';
    wb.created = new Date();

    const shiftColorMap = new Map<string, number>();
    Object.keys(shifts).forEach((key, i) => {
      shiftColorMap.set(key.toUpperCase(), i % SHIFT_PALETTE.length);
    });

    // ── Compute weekly hours per worker ───────────────────────────────────
    const getShiftHours = (code: string): number => {
      const shiftInfo = shifts[code as string];
      if (!shiftInfo?.start || !shiftInfo?.end) return 0;
      const [sh, sm] = shiftInfo.start.split(':').map(Number);
      const [eh, em] = shiftInfo.end.split(':').map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      let hrs = mins / 60;
      if ((shiftInfo as { colacion?: number }).colacion) {
        hrs -= (shiftInfo as { colacion?: number }).colacion! / 60;
      }
      return hrs;
    };

    // ── Compute per-day shift counts for summary ──────────────────────────
    const shiftCountsPerDay: Record<number, Record<string, number>> = {};
    for (let d = 0; d < daysInMonth; d++) shiftCountsPerDay[d] = {};

    for (const worker of workers) {
      const sched = scheduleData[worker.id] || [];
      const specialDays = specialDaysData[worker.id] || {};
      for (let d = 0; d < daysInMonth; d++) {
        const special = specialDays[d];
        const code = special
          ? special.slice(0, 4).toUpperCase()
          : sched[d]
            ? String(sched[d]).toUpperCase()
            : null;
        if (code && code !== 'DESC' && code !== '') {
          shiftCountsPerDay[d][code] = (shiftCountsPerDay[d][code] || 0) + 1;
        }
      }
    }

    const allShiftCodes = new Set<string>();
    for (let d = 0; d < daysInMonth; d++) {
      Object.keys(shiftCountsPerDay[d]).forEach((c) => allShiftCodes.add(c));
    }
    const summaryShiftCodes = Array.from(allShiftCodes).sort();

    // ── Create worksheet ──────────────────────────────────────────────────
    // 5 frozen cols: NOMBRE, JORNADA, SEM1, SEM2, SEM3, SEM4, SEM5 = 7 fixed cols
    const FIXED_COLS = 7; // NOMBRE, JORNADA, SEM1-5
    const ws = wb.addWorksheet('Malla de Turnos', {
      views: [{ state: 'frozen', xSplit: FIXED_COLS, ySplit: 3 }],
    });

    const totalCols = FIXED_COLS + daysInMonth;

    // ── Column widths ─────────────────────────────────────────────────────
    ws.getColumn(1).width = 24; // NOMBRE
    ws.getColumn(2).width = 8; // JORNADA
    ws.getColumn(3).width = 7; // SEM1
    ws.getColumn(4).width = 7; // SEM2
    ws.getColumn(5).width = 7; // SEM3
    ws.getColumn(6).width = 7; // SEM4
    ws.getColumn(7).width = 7; // SEM5
    for (let d = 0; d < daysInMonth; d++) {
      const dow = daysOfWeek[d] || '';
      ws.getColumn(FIXED_COLS + 1 + d).width = dow === 'S' || dow === 'D' ? 14 : 14;
    }

    // ── ROW 1: Day names (mié, jue, vie, sáb, dom...) ────────────────────
    ws.getRow(1).height = 16;
    // Fixed header cells row 1 — blank
    for (let c = 1; c <= FIXED_COLS; c++) {
      applyCell(ws.getCell(1, c), '', {
        bgArgb: C.headerBg,
        fgArgb: C.headerFg,
        bold: true,
        sz: 9,
        border: 'thin',
      });
    }

    const dayNamesMap: Record<string, string> = {
      L: 'lun',
      M: 'mar',
      X: 'mié',
      J: 'jue',
      V: 'vie',
      S: 'sáb',
      D: 'dom',
    };

    for (let d = 0; d < daysInMonth; d++) {
      const dow = daysOfWeek[d] || '';
      const isSat = dow === 'S';
      const isSun = dow === 'D';
      const bg = isSun ? C.sunHdrBg : isSat ? C.satHdrBg : C.headerBg;
      const fg = isSun ? '1E3A8A' : isSat ? '1E3A8A' : C.headerFg;
      applyCell(ws.getCell(1, FIXED_COLS + 1 + d), dayNamesMap[dow] || dow.toLowerCase(), {
        bgArgb: bg,
        fgArgb: fg,
        bold: false,
        sz: 9,
        halign: 'center',
        border: 'thin',
      });
    }

    // ── ROW 2: Fixed column headers + date strings ────────────────────────
    ws.getRow(2).height = 18;
    const fixedHeaders = ['NOMBRE', 'Jornada', 'Sem1', 'Sem2', 'Sem3', 'Sem4', 'Sem5'];
    fixedHeaders.forEach((h, i) => {
      applyCell(ws.getCell(2, i + 1), h, {
        bgArgb: C.headerBg,
        fgArgb: C.headerFg,
        bold: true,
        sz: 10,
        halign: 'center',
        border: 'thin',
      });
    });

    // Parse monthLabel to get year and month index
    // monthLabel is like "julio 2026" or "July 2026"
    const monthNames: Record<string, number> = {
      enero: 0,
      febrero: 1,
      marzo: 2,
      abril: 3,
      mayo: 4,
      junio: 5,
      julio: 6,
      agosto: 7,
      septiembre: 8,
      octubre: 9,
      noviembre: 10,
      diciembre: 11,
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };
    const parts = monthLabel.toLowerCase().split(/\s+/);
    const monthIdx = monthNames[parts[0]] ?? 0;
    const year = parseInt(parts[1] || String(new Date().getFullYear()), 10);

    for (let d = 0; d < daysInMonth; d++) {
      const dow = daysOfWeek[d] || '';
      const isSat = dow === 'S';
      const isSun = dow === 'D';
      const bg = isSun ? C.sunHdrBg : isSat ? C.satHdrBg : C.headerBg;
      const fg = isSun ? '1E3A8A' : isSat ? '1E3A8A' : C.headerFg;
      // Format date as DD-MM-YYYY
      const dateObj = new Date(year, monthIdx, d + 1);
      const dd = String(dateObj.getDate()).padStart(2, '0');
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const yyyy = dateObj.getFullYear();
      const dateStr = `${dd}-${mm}-${yyyy}`;
      applyCell(ws.getCell(2, FIXED_COLS + 1 + d), dateStr, {
        bgArgb: bg,
        fgArgb: fg,
        bold: true,
        sz: 9,
        halign: 'center',
        border: 'thin',
      });
    }

    // ── ROW 3: Empty spacer / merge row (optional thin separator) ─────────
    // We skip row 3 as a separate row — data starts at row 3
    // Actually use row 3 as data start directly (no extra row needed)
    // Data rows start at row 3
    let currentRow = 3;

    for (let wi = 0; wi < workers.length; wi++) {
      const worker = workers[wi];
      const sched = scheduleData[worker.id] || [];
      const specialDays = specialDaysData[worker.id] || {};
      const isEven = wi % 2 === 0;
      const rowBg = isEven ? C.rowEven : C.rowOdd;

      ws.getRow(currentRow).height = 16;

      // Compute weekly hours (weeks based on 7-day blocks starting from day 0)
      const weeklyHrs: number[] = [0, 0, 0, 0, 0];
      let totalHrs = 0;

      for (let d = 0; d < daysInMonth; d++) {
        const special = specialDays[d];
        const code = special
          ? special.slice(0, 4).toUpperCase()
          : sched[d]
            ? String(sched[d]).toUpperCase()
            : null;
        if (code && code !== 'DESC' && code !== '') {
          const hrs = getShiftHours((sched[d] as string) || code);
          const weekIdx = Math.min(Math.floor(d / 7), 4);
          weeklyHrs[weekIdx] += hrs;
          totalHrs += hrs;
        }
      }

      // Name
      applyCell(ws.getCell(currentRow, 1), worker.name, {
        bgArgb: rowBg,
        fgArgb: '1A1A1A',
        bold: true,
        sz: 10,
        halign: 'left',
        border: 'thin',
      });
      // Jornada
      applyCell(ws.getCell(currentRow, 2), worker.horasContratadas ?? 42, {
        bgArgb: rowBg,
        fgArgb: '1A1A1A',
        bold: true,
        sz: 9,
        halign: 'center',
        border: 'thin',
      });
      // Sem1-5
      for (let w = 0; w < 5; w++) {
        const val = weeklyHrs[w] > 0 ? Math.round(weeklyHrs[w] * 10) / 10 : '';
        applyCell(ws.getCell(currentRow, 3 + w), val, {
          bgArgb: rowBg,
          fgArgb: '1A1A1A',
          bold: false,
          sz: 9,
          halign: 'center',
          border: 'thin',
        });
      }

      // Day cells
      for (let d = 0; d < daysInMonth; d++) {
        const dow = daysOfWeek[d] || '';
        const isSun = dow === 'D';
        const isSat = dow === 'S';
        const special = specialDays[d];
        const code = special
          ? special.slice(0, 4).toUpperCase()
          : sched[d]
            ? String(sched[d]).toUpperCase()
            : null;

        // Weekend background tint
        let bg = isSun ? C.sunBg : isSat ? C.satBg : rowBg;
        let fg = '1A1A1A';
        let bold = false;
        let displayVal: string = '';

        if (!code || code === '') {
          displayVal = '';
        } else if (code === 'DESC') {
          displayVal = 'DESCANSO';
          fg = C.descFg;
          bg = C.descBg;
          bold = false;
        } else if (code === 'VACA' || code === 'VAC') {
          displayVal = 'VACACIONES';
          fg = C.vacaFg;
          bold = true;
          bg = C.vacaBg;
        } else if (code === 'LICE' || code === 'LIC') {
          displayVal = 'LICENCIA';
          fg = C.liceFg;
          bold = true;
          bg = C.liceBg;
        } else if (code === 'PERM') {
          displayVal = 'PERMISO';
          fg = C.permFg;
          bold = true;
          bg = C.permBg;
        } else if (code === 'FERI') {
          displayVal = 'FERIADO';
          fg = C.feriFg;
          bold = true;
          bg = C.feriBg;
        } else if (code === 'CUMP') {
          displayVal = 'CUMPLEAÑOS';
          fg = C.cumpFg;
          bold = true;
          bg = C.cumpBg;
        } else {
          // Regular shift — show time range
          const shiftInfo = shifts[sched[d] as string] || shifts[code];
          if (shiftInfo?.start && shiftInfo?.end) {
            displayVal = `${shiftInfo.start} - ${shiftInfo.end}`;
          } else {
            displayVal = code;
          }
          fg = '1A1A1A';
          bold = false;
        }

        applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), displayVal, {
          bgArgb: bg,
          fgArgb: fg,
          bold,
          sz: 9,
          halign: 'center',
          border: 'thin',
        });
      }

      currentRow++;
    }

    // ── BLANK SEPARATOR ROW ───────────────────────────────────────────────
    ws.getRow(currentRow).height = 8;
    currentRow++;

    // ── SUMMARY SECTION ───────────────────────────────────────────────────
    ws.getRow(currentRow).height = 18;
    applyCell(ws.getCell(currentRow, 1), 'TURNO', {
      bgArgb: C.sumHdrBg,
      fgArgb: 'FFFFFF',
      bold: true,
      sz: 9,
      halign: 'left',
      border: 'thin',
    });
    for (let c = 2; c <= FIXED_COLS; c++) {
      applyCell(ws.getCell(currentRow, c), '', {
        bgArgb: C.sumHdrBg,
        fgArgb: 'FFFFFF',
        bold: true,
        sz: 9,
        border: 'thin',
      });
    }
    for (let d = 0; d < daysInMonth; d++) {
      applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), d + 1, {
        bgArgb: C.sumHdrBg,
        fgArgb: 'FFFFFF',
        bold: true,
        sz: 9,
        border: 'thin',
      });
    }
    currentRow++;

    for (const code of summaryShiftCodes) {
      ws.getRow(currentRow).height = 15;
      const shiftInfo =
        shifts[code] || Object.values(shifts).find((s) => (s.code || '').toUpperCase() === code);
      const label = shiftInfo ? `${code} (${shiftInfo.start || ''}–${shiftInfo.end || ''})` : code;
      applyCell(ws.getCell(currentRow, 1), label, {
        bgArgb: 'FFFFFF',
        fgArgb: '1A1A1A',
        bold: true,
        sz: 9,
        halign: 'left',
        border: 'thin',
      });
      for (let c = 2; c <= FIXED_COLS; c++) {
        applyCell(ws.getCell(currentRow, c), '', {
          bgArgb: 'FFFFFF',
          fgArgb: '1A1A1A',
          sz: 9,
          border: 'thin',
        });
      }

      let rowTotal = 0;
      for (let d = 0; d < daysInMonth; d++) {
        const count = shiftCountsPerDay[d][code] || 0;
        rowTotal += count;
        applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), count > 0 ? count : '', {
          bgArgb: 'FFFFFF',
          fgArgb: '1A1A1A',
          bold: count > 0,
          sz: 9,
          border: 'thin',
        });
      }
      currentRow++;
    }

    // Grand total row
    ws.getRow(currentRow).height = 18;
    applyCell(ws.getCell(currentRow, 1), 'TOTAL TRABAJADORES', {
      bgArgb: C.sumHdrBg,
      fgArgb: 'FFFFFF',
      bold: true,
      sz: 9,
      halign: 'left',
      border: 'thin',
    });
    for (let c = 2; c <= FIXED_COLS; c++) {
      applyCell(ws.getCell(currentRow, c), '', {
        bgArgb: C.sumHdrBg,
        fgArgb: 'FFFFFF',
        bold: true,
        sz: 9,
        border: 'thin',
      });
    }
    for (let d = 0; d < daysInMonth; d++) {
      const dayTotal = Object.values(shiftCountsPerDay[d]).reduce((a, b) => a + b, 0);
      applyCell(ws.getCell(currentRow, FIXED_COLS + 1 + d), dayTotal, {
        bgArgb: C.sumHdrBg,
        fgArgb: 'FFFFFF',
        bold: true,
        sz: 9,
        border: 'thin',
      });
    }

    // ── Sheet 2: Leyenda ──────────────────────────────────────────────────
    const wsLeg = wb.addWorksheet('Leyenda');
    wsLeg.getColumn(1).width = 12;
    wsLeg.getColumn(2).width = 28;
    wsLeg.getColumn(3).width = 8;
    wsLeg.getColumn(4).width = 8;
    wsLeg.getColumn(5).width = 10;

    let lr = 1;
    applyCell(wsLeg.getCell(lr, 1), 'LEYENDA DE TURNOS', {
      bgArgb: C.headerBg,
      fgArgb: 'FFFFFF',
      bold: true,
      sz: 12,
      halign: 'left',
      border: 'thin',
    });
    wsLeg.mergeCells(lr, 1, lr, 5);
    lr++;

    ['Código', 'Nombre / Descripción', 'Inicio', 'Fin', 'Horas'].forEach((h, i) => {
      applyCell(wsLeg.getCell(lr, i + 1), h, {
        bgArgb: '4A4A4A',
        fgArgb: 'FFFFFF',
        bold: true,
        sz: 10,
        border: 'thin',
      });
    });
    lr++;

    Object.entries(shifts).forEach(([key, s]) => {
      applyCell(wsLeg.getCell(lr, 1), (s.code || key).toUpperCase(), {
        bgArgb: 'FFFFFF',
        fgArgb: '1A1A1A',
        bold: true,
        border: 'thin',
      });
      applyCell(wsLeg.getCell(lr, 2), s.label || '', {
        bgArgb: 'FFFFFF',
        fgArgb: '1A1A1A',
        halign: 'left',
        border: 'thin',
      });
      applyCell(wsLeg.getCell(lr, 3), s.start || '', {
        bgArgb: 'FFFFFF',
        fgArgb: '1A1A1A',
        border: 'thin',
      });
      applyCell(wsLeg.getCell(lr, 4), s.end || '', {
        bgArgb: 'FFFFFF',
        fgArgb: '1A1A1A',
        border: 'thin',
      });
      let hrsLabel = '';
      if (s.start && s.end) {
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        let hrs = mins / 60;
        if ((s as { colacion?: number }).colacion)
          hrs -= (s as { colacion?: number }).colacion! / 60;
        hrsLabel = `${Math.round(hrs * 10) / 10} hrs`;
      }
      applyCell(wsLeg.getCell(lr, 5), hrsLabel, {
        bgArgb: 'FFFFFF',
        fgArgb: '1A1A1A',
        border: 'thin',
      });
      lr++;
    });

    lr++;
    applyCell(wsLeg.getCell(lr, 1), 'DÍAS ESPECIALES', {
      bgArgb: C.headerBg,
      fgArgb: 'FFFFFF',
      bold: true,
      sz: 12,
      halign: 'left',
      border: 'thin',
    });
    wsLeg.mergeCells(lr, 1, lr, 5);
    lr++;

    const specialCodes = [
      { code: 'DESCANSO', desc: 'Descanso' },
      { code: 'VACACIONES', desc: 'Vacaciones' },
      { code: 'LICENCIA', desc: 'Licencia médica' },
      { code: 'PERMISO', desc: 'Permiso' },
      { code: 'FERIADO', desc: 'Feriado' },
      { code: 'CUMPLEAÑOS', desc: 'Cumpleaños' },
    ];
    specialCodes.forEach(({ code, desc }) => {
      applyCell(wsLeg.getCell(lr, 1), code, {
        bgArgb: 'F5F5F5',
        fgArgb: '333333',
        bold: true,
        border: 'thin',
      });
      applyCell(wsLeg.getCell(lr, 2), desc, {
        bgArgb: 'F5F5F5',
        fgArgb: '333333',
        halign: 'left',
        border: 'thin',
      });
      for (let c = 3; c <= 5; c++) {
        applyCell(wsLeg.getCell(lr, c), '', {
          bgArgb: 'F5F5F5',
          fgArgb: '333333',
          border: 'thin',
        });
      }
      lr++;
    });

    lr++;
    applyCell(wsLeg.getCell(lr, 1), 'INSTRUCCIONES DE IMPORTACIÓN', {
      bgArgb: C.headerBg,
      fgArgb: 'FFFFFF',
      bold: true,
      sz: 12,
      halign: 'left',
      border: 'thin',
    });
    wsLeg.mergeCells(lr, 1, lr, 5);
    lr++;

    const instructions = [
      '1. No modifiques las columnas NOMBRE ni JORNADA',
      '2. Usa los códigos de turno de la tabla de arriba',
      '3. Para descanso usa: DESC',
      '4. Para celda vacía (sin asignar) deja la celda en blanco',
      '5. Guarda el archivo y luego impórtalo en la aplicación',
    ];
    instructions.forEach((txt) => {
      applyCell(wsLeg.getCell(lr, 1), txt, {
        bgArgb: 'FAFAFA',
        fgArgb: '333333',
        sz: 9,
        halign: 'left',
        border: 'thin',
      });
      wsLeg.mergeCells(lr, 1, lr, 5);
      lr++;
    });

    // ── Download ──────────────────────────────────────────────────────────
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Malla_${monthLabel.replace(/\s+/g, '_')}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── Import ───────────────────────────────────────────────────────────────
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportStatus(null);

    try {
      const rows = (await readFirstSheetRows(file, null)) as (string | number | null)[][];

      if (rows.length < 4) {
        setImportStatus({
          type: 'error',
          message: 'El archivo no tiene el formato correcto. Usa la plantilla exportada.',
        });
        setImporting(false);
        return;
      }

      const FIXED = 7;

      const workerMap = new Map<string, string>();
      for (const w of workers) {
        workerMap.set(w.name.trim().toLowerCase(), w.id);
      }

      const shiftMap = new Map<string, string>();
      for (const [key, s] of Object.entries(shifts)) {
        shiftMap.set((s.code || key).toUpperCase(), key);
        shiftMap.set(key.toUpperCase(), key);
      }
      shiftMap.set('DESC', 'DESC');

      let imported = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (let r = 3; r < rows.length; r++) {
        const row = rows[r] as (string | number | null)[];
        if (!row || !row[0]) continue;

        const workerName = String(row[0]).trim().toLowerCase();
        const workerId = workerMap.get(workerName);

        if (!workerId) {
          skipped++;
          continue;
        }

        for (let d = 0; d < daysInMonth; d++) {
          const colIdx = FIXED + d;
          const cellVal = row[colIdx];
          if (cellVal === null || cellVal === undefined || String(cellVal).trim() === '') {
            onImport(workerId, d, null);
            imported++;
          } else {
            const rawCode = String(cellVal).trim().toUpperCase();
            const timeMatch = rawCode.match(/^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/);
            if (timeMatch) {
              const start = timeMatch[1];
              const end = timeMatch[2];
              const matchedKey = Object.entries(shifts).find(
                ([, s]) => s.start === start && s.end === end
              )?.[0];
              if (matchedKey) {
                onImport(workerId, d, matchedKey);
                imported++;
              } else {
                errors.push(`Fila ${r + 1}, día ${d + 1}: turno "${rawCode}" no encontrado`);
              }
            } else if (rawCode === 'DESC') {
              onImport(workerId, d, 'DESC');
              imported++;
            } else {
              const shiftKey = shiftMap.get(rawCode);
              if (shiftKey) {
                onImport(workerId, d, shiftKey);
                imported++;
              } else {
                errors.push(`Fila ${r + 1}, día ${d + 1}: código desconocido "${rawCode}"`);
              }
            }
          }
        }
      }

      if (errors.length > 0 && imported === 0) {
        setImportStatus({ type: 'error', message: `No se pudo importar. ${errors[0]}` });
      } else {
        const msg = `✓ Importación completada: ${imported} celdas actualizadas${skipped > 0 ? `, ${skipped} trabajadoras no encontradas` : ''}${errors.length > 0 ? `. ${errors.length} celda(s) con código desconocido omitidas` : ''}.`;
        setImportStatus({ type: 'success', message: msg });
      }
    } catch {
      setImportStatus({
        type: 'error',
        message: 'Error al leer el archivo. Asegúrate de que sea un archivo .xlsx válido.',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-gradient-to-r from-emerald-600 to-teal-600">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={22} className="text-white" />
            <div>
              <h2 className="text-base font-bold text-white">Excel — Malla de Turnos</h2>
              <p className="text-emerald-100 text-xs">{monthLabel}</p>
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
        <div className="p-6 space-y-4">
          {/* Export */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Download size={18} className="text-emerald-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Exportar a Excel</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Descarga la malla con celdas coloreadas por turno, fines de semana destacados y
                  resumen por día.
                </p>
              </div>
            </div>
            <button
              onClick={handleExport}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors active:scale-95"
            >
              <Download size={15} />
              Descargar plantilla Excel
            </button>
          </div>

          {/* Import */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Upload size={18} className="text-blue-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Importar desde Excel</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Sube el archivo modificado para actualizar los turnos. Usa la plantilla exportada
                  para evitar errores.
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="hidden"
              id="malla-excel-import"
            />
            <label
              htmlFor="malla-excel-import"
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer border-2 border-dashed
                ${
                  importing
                    ? 'border-blue-300 bg-blue-50 text-blue-400 cursor-not-allowed'
                    : 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-500 active:scale-95'
                }`}
            >
              {importing ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Importando...
                </>
              ) : (
                <>
                  <Upload size={15} />
                  Seleccionar archivo .xlsx
                </>
              )}
            </label>
          </div>

          {/* Status message */}
          {importStatus && (
            <div
              className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm
              ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {importStatus.type === 'success' ? (
                <CheckCircle size={16} className="flex-shrink-0 mt-0.5 text-emerald-600" />
              ) : (
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5 text-red-600" />
              )}
              <span>{importStatus.message}</span>
            </div>
          )}

          {/* Tips */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs font-semibold text-amber-800 mb-1.5">💡 Consejos</p>
            <ul className="text-xs text-amber-700 space-y-1 list-disc list-inside">
              <li>Exporta primero para obtener la plantilla correcta</li>
              <li>No modifiques las columnas de nombre ni jornada</li>
              <li>Los códigos de turno están en la hoja «Leyenda»</li>
              <li>Celda vacía = sin turno asignado</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

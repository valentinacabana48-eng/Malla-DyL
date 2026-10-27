'use client';
import React, { useState, useMemo, useRef } from 'react';
import {
  Eye,
  Download,
  Printer,
  ChevronDown,
  User,
  Calendar,
  List,
  Coffee,
  Search,
} from 'lucide-react';
import {
  useAppContext,
  getDaysOfWeekForMonth,
  getDaysInMonth,
  calcNetHours,
  MESES,
  monthLabelToKey,
} from '@/context/AppContext';
import MultiSelect from '@/components/ui/MultiSelect';
import { useCargoOptions } from '@/hooks/useCargoOptions';

const MULTI_WRAPPER = 'flex-1 min-w-[180px] max-w-[300px]';
const MULTI_LABEL =
  'block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5';
const MULTI_BUTTON =
  'w-full py-2.5 bg-input border border-border rounded-lg text-sm font-medium text-foreground';

// Build a Mon-Sun weekly calendar grid for the month
function buildCalendarWeeks(monthLabel: string): {
  date: number;
  dow: string;
  dowFull: string;
  isOtherMonth?: boolean;
  otherMonthDate?: number;
}[][] {
  const MONTH_NAMES: Record<string, number> = {
    Enero: 0,
    Febrero: 1,
    Marzo: 2,
    Abril: 3,
    Mayo: 4,
    Junio: 5,
    Julio: 6,
    Agosto: 7,
    Septiembre: 8,
    Octubre: 9,
    Noviembre: 10,
    Diciembre: 11,
  };
  const parts = monthLabel.split(' ');
  const monthIdx = MONTH_NAMES[parts[0]] ?? 6;
  const year = parseInt(parts[1] || '2026', 10);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const DOW_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const DOW_FULL_MAP: Record<number, string> = {
    0: 'DOMINGO',
    1: 'LUNES',
    2: 'MARTES',
    3: 'MIÉRCOLES',
    4: 'JUEVES',
    5: 'VIERNES',
    6: 'SÁBADO',
  };

  const prevMonthDays = new Date(year, monthIdx, 0).getDate();
  const firstDow = new Date(year, monthIdx, 1).getDay();
  const firstMonIdx = (firstDow + 6) % 7;

  type Cell = {
    date: number;
    dow: string;
    dowFull: string;
    isOtherMonth?: boolean;
    otherMonthDate?: number;
  };
  const cells: Cell[] = [];

  for (let p = 0; p < firstMonIdx; p++) {
    const prevDay = prevMonthDays - firstMonIdx + 1 + p;
    const date = new Date(year, monthIdx - 1, prevDay);
    const dowLetter = DOW_LETTERS[date.getDay()];
    const dowFull =
      date.getDay() === 2
        ? 'MARTES'
        : date.getDay() === 3
          ? 'MIÉRCOLES'
          : DOW_FULL_MAP[date.getDay()] || dowLetter;
    cells.push({ date: 0, dow: dowLetter, dowFull, isOtherMonth: true, otherMonthDate: prevDay });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, monthIdx, d);
    const dowLetter = DOW_LETTERS[date.getDay()];
    const dowFull =
      date.getDay() === 2
        ? 'MARTES'
        : date.getDay() === 3
          ? 'MIÉRCOLES'
          : DOW_FULL_MAP[date.getDay()] || dowLetter;
    cells.push({ date: d, dow: dowLetter, dowFull });
  }

  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const date = new Date(year, monthIdx + 1, nextDay);
    const dowLetter = DOW_LETTERS[date.getDay()];
    const dowFull =
      date.getDay() === 2
        ? 'MARTES'
        : date.getDay() === 3
          ? 'MIÉRCOLES'
          : DOW_FULL_MAP[date.getDay()] || dowLetter;
    cells.push({ date: 0, dow: dowLetter, dowFull, isOtherMonth: true, otherMonthDate: nextDay });
    nextDay++;
  }

  const weeks: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

// Para buscar sin importar mayúsculas ni tildes
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function dayIndexFromDate(date: number): number {
  return date - 1;
}

function buildMonthClippedWeeks(
  monthLabel: string,
  daysInMonthCount: number
): { startDay: number; endDay: number }[] {
  const MONTH_NAMES_MAP: Record<string, number> = {
    Enero: 0,
    Febrero: 1,
    Marzo: 2,
    Abril: 3,
    Mayo: 4,
    Junio: 5,
    Julio: 6,
    Agosto: 7,
    Septiembre: 8,
    Octubre: 9,
    Noviembre: 10,
    Diciembre: 11,
  };
  const parts = (monthLabel || '').split(' ');
  const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 7;
  const year = parseInt(parts[1] || '2026', 10);

  const weeks: { startDay: number; endDay: number }[] = [];
  let wd = 1;
  while (wd <= daysInMonthCount) {
    const date = new Date(year, monthIdx, wd);
    const dow = (date.getDay() + 6) % 7;
    const weekMonday = wd - dow;
    const weekSunday = weekMonday + 6;
    const startDay = Math.max(1, weekMonday);
    const endDay = Math.min(daysInMonthCount, weekSunday);
    weeks.push({ startDay, endDay });
    wd = endDay + 1;
  }
  return weeks;
}

function calcClippedWeekHours(
  startDay: number,
  endDay: number,
  sched: (string | null)[],
  specialDaysMap: Record<number, string>,
  shifts: Record<string, import('@/context/AppContext').Shift>
): number {
  let total = 0;
  for (let d = startDay; d <= endDay; d++) {
    const idx = d - 1;
    const specialDay = specialDaysMap[idx];
    if (specialDay) continue;
    const code = sched[idx];
    if (code && code !== 'DESC' && shifts[code]) {
      total += calcNetHours(shifts[code]);
    }
  }
  return Math.round(total * 10) / 10;
}

// ── Grouped Workers List Print Component ──
interface WorkerShiftRow {
  num: number;
  name: string;
  shiftLabel: string;
  start: string;
  end: string;
  colacion: number;
}

interface GroupedListPrintProps {
  workers: import('@/context/AppContext').Worker[];
  shifts: Record<string, import('@/context/AppContext').Shift>;
  scheduleData: import('@/context/AppContext').ScheduleData;
  monthLabel: string;
  /** [] = todas / todos */
  sucursales: string[];
  areas: string[];
  cargos: string[];
}

function GroupedListPrint({
  workers,
  shifts,
  scheduleData,
  monthLabel,
  sucursales,
  areas,
  cargos,
}: GroupedListPrintProps) {
  const monthKey = monthLabelToKey(monthLabel);
  const monthParts = monthLabel.split(' ');
  const monthName = monthParts[0] || '';
  const monthYear = monthParts[1] || '';

  // Filter workers
  const filtered = workers.filter((w) => {
    if (w.estado !== 'Activo') return false;
    if (sucursales.length > 0 && !sucursales.includes(w.sucursal)) return false;
    if (areas.length > 0 && !areas.includes(w.area)) return false;
    if (cargos.length > 0 && !cargos.includes(w.cargo)) return false;
    return true;
  });

  // For each worker, find their most common shift this month
  function getWorkerShifts(
    workerId: string
  ): { shift: import('@/context/AppContext').Shift | null; days: number }[] {
    const sched = (scheduleData[monthKey] || {})[workerId] || [];
    const counts: Record<string, number> = {};
    sched.forEach((code) => {
      if (code && code !== 'DESC' && shifts[code]) {
        counts[code] = (counts[code] || 0) + 1;
      }
    });
    const topCodes = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ shift: shifts[code] || null, days: count }));
    return topCodes;
  }

  // Build rows with shift info
  const rows: WorkerShiftRow[] = filtered.map((w) => {
    const workerShifts = getWorkerShifts(w.id);
    const primary = workerShifts[0] || { shift: null, days: 0 };
    const shiftLabel =
      workerShifts.length > 0
        ? workerShifts.map((s) => (s.shift ? `${s.shift.label} (${s.days}d)` : '—')).join(', ')
        : '—';
    return {
      num: 0,
      name: w.name,
      shiftLabel,
      start: primary.shift?.start || '—',
      end: primary.shift?.end || '—',
      colacion: primary.shift?.colacion || 0,
    };
  });

  // Sort by entry time ascending (workers without shift go to end)
  rows.sort((a, b) => {
    if (a.start === '—' && b.start === '—') return 0;
    if (a.start === '—') return 1;
    if (b.start === '—') return -1;
    const [ah, am] = a.start.split(':').map(Number);
    const [bh, bm] = b.start.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });

  // Assign sequential numbers
  rows.forEach((r, i) => {
    r.num = i + 1;
  });

  return (
    <div className="bg-white p-8 rounded-xl border border-border shadow-sm">
      {/* Logos */}
      <div className="flex justify-center items-center gap-6 mb-4">
        <img
          src="/assets/images/descarga-1784608578238.png"
          alt="Mayorista DyL"
          className="h-20 object-contain"
        />
        <img
          src="/assets/images/descarga__2_-1784608577889.png"
          alt="Envases DyL"
          className="h-20 object-contain"
        />
        <img
          src="/assets/images/descarga__1_-1784608578251.png"
          alt="Distribuidora DyL"
          className="h-20 object-contain"
        />
      </div>

      {/* Title */}
      <h1 className="text-center text-xl font-black tracking-widest text-gray-900 mb-1 uppercase">
        LISTADO DE TURNOS — {monthName} {monthYear}
      </h1>
      {(sucursales.length > 0 || areas.length > 0 || cargos.length > 0) && (
        <p className="text-center text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wide">
          {[
            sucursales.length > 0
              ? `Sucursal${sucursales.length > 1 ? 'es' : ''}: ${sucursales.join(', ')}`
              : '',
            areas.length > 0 ? `Área${areas.length > 1 ? 's' : ''}: ${areas.join(', ')}` : '',
            cargos.length > 0 ? `Cargo${cargos.length > 1 ? 's' : ''}: ${cargos.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      <div className="mb-4" />

      {/* Single table sorted by entry time */}
      <table className="w-full border-collapse border border-gray-400 text-xs">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-2 py-1.5 text-center font-black text-gray-700 w-8">
              #
            </th>
            <th className="border border-gray-300 px-3 py-1.5 text-left font-black text-gray-700">
              NOMBRE
            </th>
            <th className="border border-gray-300 px-2 py-1.5 text-center font-black text-gray-700 w-28">
              TURNO
            </th>
            <th className="border border-gray-300 px-2 py-1.5 text-center font-black text-gray-700 w-20">
              ENTRADA
            </th>
            <th className="border border-gray-300 px-2 py-1.5 text-center font-black text-gray-700 w-20">
              SALIDA
            </th>
            <th className="border border-gray-300 px-2 py-1.5 text-center font-black text-gray-700 w-24">
              COLACIÓN
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
              <td className="border border-gray-300 px-2 py-1 text-center font-bold text-gray-700">
                {row.num}
              </td>
              <td className="border border-gray-300 px-3 py-1 text-gray-800 font-medium">
                {row.name}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-gray-700">
                {row.shiftLabel !== '—' ? row.shiftLabel : ''}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-gray-700">
                {row.start !== '—' ? row.start : ''}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-gray-700">
                {row.end !== '—' ? row.end : ''}
              </td>
              <td className="border border-gray-300 px-2 py-1 text-center text-gray-700">
                {row.colacion > 0 ? `${row.colacion} min` : '0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type NonWorkingTypeInfo = { code: string; label: string };

/** Malla mensual de una trabajadora: copia trabajador/a (opcional) y copia empresa para firmar */
function MallaDocument({
  worker,
  monthLabel,
  schedule,
  specialDaysMap,
  shifts,
  nonWorkingTypes,
  printVersion,
  breakBefore,
}: {
  worker: import('@/context/AppContext').Worker;
  monthLabel: string;
  schedule: (string | null)[];
  specialDaysMap: Record<number, string>;
  shifts: Record<string, import('@/context/AppContext').Shift>;
  nonWorkingTypes: NonWorkingTypeInfo[];
  printVersion: 'trabajador' | 'empresa';
  /** Empieza en una hoja nueva (cuando se imprimen varias seguidas) */
  breakBefore: boolean;
}) {
  const calendarWeeks = useMemo(() => buildCalendarWeeks(monthLabel), [monthLabel]);
  const monthCalendarWeeks = useMemo(
    () => calendarWeeks.filter((week) => week.some((cell) => !cell.isOtherMonth && cell.date > 0)),
    [calendarWeeks]
  );
  const summary = useMemo(
    () => computeSummary(monthLabel, schedule, specialDaysMap, shifts),
    [monthLabel, schedule, specialDaysMap, shifts]
  );
  const monthParts = monthLabel.split(' ');
  const monthName = monthParts[0] || 'Julio';
  const monthYear = monthParts[1] || '2026';

  return (
    <>
      {/* ── COPY 1: Worker's copy (solo en la versión trabajador/a) ── */}
      {printVersion === 'trabajador' && (
        <div
          className={`pdf-page bg-white p-3 lg:p-8 print:p-8 rounded-xl border border-border shadow-sm ${breakBefore ? 'pdf-page-break mt-8' : ''}`}
        >
          {/* Copy label */}
          <div className="text-right mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest border border-gray-300 rounded px-2 py-0.5">
              Copia trabajador/a
            </span>
          </div>

          {/* Logos */}
          <div className="flex justify-center items-center gap-3 lg:gap-6 print:gap-6 mb-6">
            <img
              src="/assets/images/descarga-1784608578238.png"
              alt="Mayorista DyL"
              className="h-14 lg:h-24 print:h-24 object-contain"
            />
            <img
              src="/assets/images/descarga__2_-1784608577889.png"
              alt="Envases DyL"
              className="h-14 lg:h-24 print:h-24 object-contain"
            />
            <img
              src="/assets/images/descarga__1_-1784608578251.png"
              alt="Distribuidora DyL"
              className="h-14 lg:h-24 print:h-24 object-contain"
            />
          </div>

          {/* Title */}
          <h1 className="text-center text-2xl font-black tracking-widest text-gray-900 mb-6 uppercase">
            MALLA MENSUAL
          </h1>

          {/* Worker name + Month boxes */}
          <div className="flex gap-3 lg:gap-6 print:gap-6 mb-6">
            <div className="flex-1 border-2 border-gray-400 rounded bg-orange-50 px-3 lg:px-6 print:px-6 py-3 flex items-center justify-center text-center">
              <span className="text-base lg:text-xl print:text-xl font-bold text-gray-800">
                {worker.name}
              </span>
            </div>
            <div className="flex-1 border-2 border-gray-400 rounded bg-orange-50 px-3 lg:px-6 print:px-6 py-3 flex items-center justify-center text-center">
              <span className="text-base lg:text-xl print:text-xl font-bold text-gray-800">
                {monthName} {monthYear}
              </span>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="border-2 border-gray-400 rounded overflow-hidden mb-6">
            {/* Header row */}
            <div className="grid grid-cols-7 border-b-2 border-gray-400">
              {['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'].map(
                (day) => (
                  <div
                    key={day}
                    className="text-center py-2 text-[11px] lg:text-xs print:text-xs font-black text-gray-800 border-r border-gray-300 last:border-r-0 bg-gray-50"
                  >
                    {/* Celular: día abreviado (LUN, MAR…) para que quepa */}
                    <span className="lg:hidden print:hidden">{day.slice(0, 3)}</span>
                    <span className="hidden lg:inline print:inline">{day}</span>
                  </div>
                )
              )}
            </div>

            {/* Week rows */}
            {calendarWeeks.map((week, wi) => (
              <div
                key={`week-${wi}`}
                className="grid grid-cols-7 border-b border-gray-300 last:border-b-0"
              >
                {week.map((cell, ci) => {
                  if (cell.isOtherMonth) {
                    return (
                      <div
                        key={`other-${wi}-${ci}`}
                        className="border-r border-gray-300 last:border-r-0 min-h-[60px] p-0.5 lg:p-1.5 print:p-1.5 min-w-0 flex flex-col items-center justify-start bg-gray-50/70"
                      >
                        <span className="text-xs font-bold text-gray-300 mb-1">
                          {cell.otherMonthDate}
                        </span>
                      </div>
                    );
                  }
                  if (!cell.date) {
                    return (
                      <div
                        key={`empty-${wi}-${ci}`}
                        className="border-r border-gray-300 last:border-r-0 min-h-[60px] bg-gray-50/50"
                      />
                    );
                  }
                  const idx = dayIndexFromDate(cell.date);
                  const code = schedule[idx] ?? null;
                  const specialDayCode = specialDaysMap[idx];
                  const shiftInfo =
                    code && code !== 'DESC' && !specialDayCode ? shifts[code] : null;
                  const isSunday = ci === 6;

                  let cellLabel: string | null = null;
                  let cellColor = 'text-gray-500';

                  if (specialDayCode) {
                    const nwt = nonWorkingTypes.find((t) => t.code === specialDayCode);
                    cellLabel = nwt ? nwt.label.toUpperCase() : specialDayCode;
                    cellColor = 'text-yellow-700';
                  } else if (code === 'DESC') {
                    cellLabel = 'DESCANSO';
                    cellColor = 'text-gray-500';
                  } else if (!code) {
                    cellLabel = 'DESCANSO';
                    cellColor = 'text-gray-400';
                  }

                  return (
                    <div
                      key={`cell-${wi}-${ci}`}
                      className={`border-r border-gray-300 last:border-r-0 min-h-[60px] p-0.5 lg:p-1.5 print:p-1.5 min-w-0 flex flex-col items-center justify-start ${isSunday ? 'bg-red-50/30' : ''}`}
                    >
                      <span className="text-xs font-bold text-gray-700 mb-1">{cell.date}</span>
                      {shiftInfo ? (
                        <>
                          <span className="hidden lg:block print:block text-[10px] font-bold text-blue-700 text-center leading-tight">
                            {shiftInfo.label.toUpperCase()}
                          </span>
                          <span className="text-[10px] lg:text-[9px] print:text-[9px] font-bold lg:font-semibold print:font-semibold text-blue-600 text-center leading-tight [overflow-wrap:anywhere]">
                            {shiftInfo.start} - {shiftInfo.end}
                          </span>
                          {shiftInfo.colacion > 0 && (
                            <span className="text-[8px] font-semibold text-amber-700 text-center leading-tight flex items-center gap-0.5 mt-0.5">
                              <Coffee size={7} className="text-amber-700 flex-shrink-0" />
                              {shiftInfo.colacion}m
                            </span>
                          )}
                        </>
                      ) : (
                        <span
                          className={`text-[9px] lg:text-[10px] print:text-[10px] font-semibold text-center leading-tight [overflow-wrap:anywhere] ${cellColor}`}
                        >
                          {/* Celular: palabras largas abreviadas (DESCANSO → DESC.) */}
                          <span className="lg:hidden print:hidden">
                            {cellLabel && cellLabel.length > 7
                              ? `${cellLabel.slice(0, 4)}.`
                              : cellLabel}
                          </span>
                          <span className="hidden lg:inline print:inline">{cellLabel}</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Resumen de turno */}
          <div className="border-2 border-gray-400 rounded overflow-hidden">
            <div className="bg-gray-100 border-b-2 border-gray-400 py-2 text-center">
              <span className="text-sm font-black text-gray-800 uppercase tracking-wider">
                RESUMEN DE TURNO
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-8 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-gray-800 underline">JORNADA</span>
                  <span className="text-2xl font-black text-gray-900 underline">
                    {worker.horasContratadas}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-black text-gray-800 underline">
                    DOMINGOS TRABAJADOS
                  </span>
                  <span className="text-2xl font-black text-gray-900 underline">
                    {summary?.sundaysWorked ?? 0}
                  </span>
                </div>
              </div>

              {(() => {
                const weekHours = summary?.weeklyHours || [];
                const totalWeeks = Math.max(weekHours.length, monthCalendarWeeks.length);
                const colsClass =
                  totalWeeks === 6
                    ? 'grid-cols-6'
                    : totalWeeks === 4
                      ? 'grid-cols-4'
                      : 'grid-cols-5';
                return (
                  <div className={`grid ${colsClass} gap-3`}>
                    {Array.from({ length: totalWeeks }).map((_, wi) => (
                      <div key={`week-sum-${wi}`} className="text-center">
                        <p className="text-xs font-bold text-gray-700 mb-1">Semana {wi + 1}</p>
                        <p className="text-xl font-black text-gray-900">{weekHours[wi] ?? 0}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── COPY 2: Signature copy ── */}
      <div
        className={`pdf-page bg-white p-3 lg:p-8 print:p-8 rounded-xl border border-border shadow-sm ${printVersion === 'trabajador' || breakBefore ? 'pdf-page-break mt-8' : ''}`}
      >
        {/* Copy label */}
        <div className="text-right mb-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest border border-gray-300 rounded px-2 py-0.5">
            Copia empresa — para firmar
          </span>
        </div>

        {/* Logos */}
        <div className="flex justify-center items-center gap-3 lg:gap-6 print:gap-6 mb-6">
          <img
            src="/assets/images/descarga-1784608578238.png"
            alt="Mayorista DyL"
            className="h-14 lg:h-24 print:h-24 object-contain"
          />
          <img
            src="/assets/images/descarga__2_-1784608577889.png"
            alt="Envases DyL"
            className="h-14 lg:h-24 print:h-24 object-contain"
          />
          <img
            src="/assets/images/descarga__1_-1784608578251.png"
            alt="Distribuidora DyL"
            className="h-14 lg:h-24 print:h-24 object-contain"
          />
        </div>

        <h1 className="text-center text-2xl font-black tracking-widest text-gray-900 mb-6 uppercase">
          MALLA MENSUAL
        </h1>

        <div className="flex gap-3 lg:gap-6 print:gap-6 mb-6">
          <div className="flex-1 border-2 border-gray-400 rounded bg-orange-50 px-3 lg:px-6 print:px-6 py-3 flex items-center justify-center text-center">
            <span className="text-base lg:text-xl print:text-xl font-bold text-gray-800">
              {worker.name}
            </span>
          </div>
          <div className="flex-1 border-2 border-gray-400 rounded bg-orange-50 px-3 lg:px-6 print:px-6 py-3 flex items-center justify-center text-center">
            <span className="text-base lg:text-xl print:text-xl font-bold text-gray-800">
              {monthName} {monthYear}
            </span>
          </div>
        </div>

        <div className="border-2 border-gray-400 rounded overflow-hidden mb-6">
          <div className="grid grid-cols-7 border-b-2 border-gray-400">
            {['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'].map(
              (day) => (
                <div
                  key={day}
                  className="text-center py-2 text-[11px] lg:text-xs print:text-xs font-black text-gray-800 border-r border-gray-300 last:border-r-0 bg-gray-50"
                >
                  {/* Celular: día abreviado (LUN, MAR…) para que quepa */}
                  <span className="lg:hidden print:hidden">{day.slice(0, 3)}</span>
                  <span className="hidden lg:inline print:inline">{day}</span>
                </div>
              )
            )}
          </div>
          {calendarWeeks.map((week, wi) => (
            <div
              key={`week2-${wi}`}
              className="grid grid-cols-7 border-b border-gray-300 last:border-b-0"
            >
              {week.map((cell, ci) => {
                if (cell.isOtherMonth) {
                  return (
                    <div
                      key={`other2-${wi}-${ci}`}
                      className="border-r border-gray-300 last:border-r-0 min-h-[60px] p-0.5 lg:p-1.5 print:p-1.5 min-w-0 flex flex-col items-center justify-start bg-gray-50/70"
                    >
                      <span className="text-xs font-bold text-gray-300 mb-1">
                        {cell.otherMonthDate}
                      </span>
                    </div>
                  );
                }
                if (!cell.date) {
                  return (
                    <div
                      key={`empty2-${wi}-${ci}`}
                      className="border-r border-gray-300 last:border-r-0 min-h-[60px] bg-gray-50/50"
                    />
                  );
                }
                const idx = dayIndexFromDate(cell.date);
                const code = schedule[idx] ?? null;
                const specialDayCode = specialDaysMap[idx];
                const shiftInfo = code && code !== 'DESC' && !specialDayCode ? shifts[code] : null;
                const isSunday = ci === 6;

                let cellLabel: string | null = null;
                let cellColor = 'text-gray-500';

                if (specialDayCode) {
                  const nwt = nonWorkingTypes.find((t) => t.code === specialDayCode);
                  cellLabel = nwt ? nwt.label.toUpperCase() : specialDayCode;
                  cellColor = 'text-yellow-700';
                } else if (code === 'DESC') {
                  cellLabel = 'DESCANSO';
                  cellColor = 'text-gray-500';
                } else if (!code) {
                  cellLabel = 'DESCANSO';
                  cellColor = 'text-gray-400';
                }

                return (
                  <div
                    key={`cell2-${wi}-${ci}`}
                    className={`border-r border-gray-300 last:border-r-0 min-h-[60px] p-0.5 lg:p-1.5 print:p-1.5 min-w-0 flex flex-col items-center justify-start ${isSunday ? 'bg-red-50/30' : ''}`}
                  >
                    <span className="text-xs font-bold text-gray-700 mb-1">{cell.date}</span>
                    {shiftInfo ? (
                      <>
                        <span className="hidden lg:block print:block text-[10px] font-bold text-blue-700 text-center leading-tight">
                          {shiftInfo.label.toUpperCase()}
                        </span>
                        <span className="text-[10px] lg:text-[9px] print:text-[9px] font-bold lg:font-semibold print:font-semibold text-blue-600 text-center leading-tight [overflow-wrap:anywhere]">
                          {shiftInfo.start} - {shiftInfo.end}
                        </span>
                        {shiftInfo.colacion > 0 && (
                          <span className="text-[8px] font-semibold text-amber-700 text-center leading-tight flex items-center gap-0.5 mt-0.5">
                            <Coffee size={7} className="text-amber-700 flex-shrink-0" />
                            {shiftInfo.colacion}m
                          </span>
                        )}
                      </>
                    ) : (
                      <span
                        className={`text-[9px] lg:text-[10px] print:text-[10px] font-semibold text-center leading-tight [overflow-wrap:anywhere] ${cellColor}`}
                      >
                        {/* Celular: palabras largas abreviadas (DESCANSO → DESC.) */}
                        <span className="lg:hidden print:hidden">
                          {cellLabel && cellLabel.length > 7
                            ? `${cellLabel.slice(0, 4)}.`
                            : cellLabel}
                        </span>
                        <span className="hidden lg:inline print:inline">{cellLabel}</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-2 border-gray-400 rounded overflow-hidden mb-8">
          <div className="bg-gray-100 border-b-2 border-gray-400 py-2 text-center">
            <span className="text-sm font-black text-gray-800 uppercase tracking-wider">
              RESUMEN DE TURNO
            </span>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-8 mb-4">
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-gray-800 underline">JORNADA</span>
                <span className="text-2xl font-black text-gray-900 underline">
                  {worker.horasContratadas}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-gray-800 underline">
                  DOMINGOS TRABAJADOS
                </span>
                <span className="text-2xl font-black text-gray-900 underline">
                  {summary?.sundaysWorked ?? 0}
                </span>
              </div>
            </div>
            {(() => {
              const weekHours = summary?.weeklyHours || [];
              const totalWeeks = Math.max(weekHours.length, monthCalendarWeeks.length);
              const colsClass =
                totalWeeks === 6 ? 'grid-cols-6' : totalWeeks === 4 ? 'grid-cols-4' : 'grid-cols-5';
              return (
                <div className={`grid ${colsClass} gap-3`}>
                  {Array.from({ length: totalWeeks }).map((_, wi) => (
                    <div key={`week-sum2-${wi}`} className="text-center">
                      <p className="text-xs font-bold text-gray-700 mb-1">Semana {wi + 1}</p>
                      <p className="text-xl font-black text-gray-900">{weekHours[wi] ?? 0}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Signature section */}
        <div className="border-2 border-gray-400 rounded p-6">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-6 text-center">
            Declaro haber recibido conforme la presente malla de turnos
          </p>
          <div className="flex gap-10 justify-around">
            <div className="flex-1 text-center">
              <div className="border-b-2 border-gray-700 mb-2 h-12" />
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">
                Firma trabajador/a
              </p>
              <p className="text-xs text-gray-500 mt-1">{worker.name}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function computeSummary(
  monthLabel: string,
  sched: (string | null)[],
  specialDaysMap: Record<number, string>,
  shifts: Record<string, import('@/context/AppContext').Shift>
) {
  const daysInMonth = getDaysInMonth(monthLabel);
  let workDays = 0;
  let sundaysWorked = 0;
  const daysOfWeek = getDaysOfWeekForMonth(monthLabel);

  for (let i = 0; i < daysInMonth; i++) {
    const code = sched[i];
    const specialDay = specialDaysMap[i];
    if (!specialDay && code && code !== 'DESC') {
      workDays++;
      if (daysOfWeek[i] === 'D') sundaysWorked++;
    }
  }

  const clippedWeeks = buildMonthClippedWeeks(monthLabel, daysInMonth);
  const weeklyHours = clippedWeeks.map((w) =>
    calcClippedWeekHours(w.startDay, w.endDay, sched, specialDaysMap, shifts)
  );

  // Compute primary shift colación
  const counts: Record<string, number> = {};
  sched.forEach((code) => {
    if (code && code !== 'DESC' && shifts[code]) {
      counts[code] = (counts[code] || 0) + 1;
    }
  });
  const topCode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const colacion = topCode && shifts[topCode] ? shifts[topCode].colacion || 0 : 0;

  return { workDays, sundaysWorked, weeklyHours, colacion };
}

export default function VistaPreviaContent() {
  const {
    workers,
    shifts,
    scheduleData,
    specialDays,
    sucursales,
    areas,
    selectedMes,
    getAllNonWorkingTypes,
    globalSucursal,
    ensureMonths,
  } = useAppContext();
  const nonWorkingTypes = getAllNonWorkingTypes();

  // [] = todas / todos
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [selectedCargos, setSelectedCargos] = useState<string[]>([]);
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>(
    globalSucursal && globalSucursal !== 'Todas' ? [globalSucursal] : []
  );
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  const [exportMes, setExportMes] = useState(selectedMes);
  const [activeTab, setActiveTab] = useState<'individual' | 'lista'>('individual');
  const [searchName, setSearchName] = useState('');
  // Trabajador/a: las 2 copias. Empresa: solo la copia para firmar.
  const [printVersion, setPrintVersion] = useState<'trabajador' | 'empresa'>('trabajador');

  React.useEffect(() => {
    setSelectedSucursales(globalSucursal && globalSucursal !== 'Todas' ? [globalSucursal] : []);
    setSelectedWorkerId('');
  }, [globalSucursal]);

  // El mes elegido puede no estar cargado todavía (solo se cargan los cercanos)
  React.useEffect(() => {
    ensureMonths([monthLabelToKey(exportMes)]);
  }, [exportMes, ensureMonths]);

  const cargoOptions = useCargoOptions(selectedAreas, selectedCargos, setSelectedCargos);

  const filteredWorkers = useMemo(() => {
    const query = normalizeText(searchName);
    return workers.filter((w) => {
      if (w.estado !== 'Activo') return false;
      if (selectedAreas.length > 0 && !selectedAreas.includes(w.area)) return false;
      if (selectedSucursales.length > 0 && !selectedSucursales.includes(w.sucursal)) return false;
      if (selectedCargos.length > 0 && !selectedCargos.includes(w.cargo)) return false;
      if (query && !normalizeText(w.name).includes(query)) return false;
      return true;
    });
  }, [workers, selectedAreas, selectedSucursales, selectedCargos, searchName]);

  // Si la búsqueda deja una sola trabajadora, se elige sola
  React.useEffect(() => {
    if (searchName.trim() && filteredWorkers.length === 1) {
      setSelectedWorkerId(filteredWorkers[0].id);
    }
  }, [searchName, filteredWorkers]);

  const selectedWorker = useMemo(
    () => workers.find((w) => w.id === selectedWorkerId) || null,
    [workers, selectedWorkerId]
  );

  const workerSchedule = useMemo(() => {
    if (!selectedWorkerId) return [];
    const monthKey = monthLabelToKey(exportMes);
    return (scheduleData[monthKey] || {})[selectedWorkerId] || Array(31).fill(null);
  }, [scheduleData, selectedWorkerId, exportMes]);

  const workerSpecialDays = useMemo(() => {
    if (!selectedWorkerId) return {} as Record<number, string>;
    const monthKey = monthLabelToKey(exportMes);
    return (specialDays[monthKey] || {})[selectedWorkerId] || {};
  }, [specialDays, selectedWorkerId, exportMes]);

  // Imprimir todas: se dibujan las mallas de todas las trabajadoras filtradas (solo en
  // la impresión) y se manda a imprimir cuando cargan los logos
  const [printingAll, setPrintingAll] = useState(false);
  const bulkRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!printingAll) return;
    let cancelled = false;
    const imgs = Array.from(bulkRef.current?.querySelectorAll('img') ?? []);
    Promise.all(
      imgs.map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, { once: true });
              img.addEventListener('error', resolve, { once: true });
            })
      )
    ).then(() => {
      if (cancelled) return;
      window.addEventListener('afterprint', () => setPrintingAll(false), { once: true });
      window.print();
    });
    return () => {
      cancelled = true;
    };
  }, [printingAll]);

  const handlePrintAll = () => {
    const n = filteredWorkers.length;
    if (n === 0) return;
    const hojas = printVersion === 'trabajador' ? n * 2 : n;
    const ok = window.confirm(
      `Se van a imprimir las mallas de ${n} trabajador${n === 1 ? 'a' : 'as'} (${hojas} hoja${hojas === 1 ? '' : 's'}, ${printVersion === 'trabajador' ? 'versión trabajador/a: 2 copias cada una' : 'versión empresa: solo la copia para firmar'}). ¿Continuar?`
    );
    if (ok) setPrintingAll(true);
  };

  const handlePrint = () => {
    window.print();
  };
  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-wide text-foreground uppercase flex items-center gap-2">
            <Eye size={24} className="text-secondary" />
            Vista Previa
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Malla mensual individual por trabajador/a
          </p>
        </div>
        {(activeTab === 'lista' ||
          selectedWorker ||
          (activeTab === 'individual' && filteredWorkers.length > 0)) && (
          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === 'individual' && filteredWorkers.length > 0 && (
              <button
                onClick={handlePrintAll}
                disabled={printingAll}
                className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
              >
                <Printer size={15} />
                {printingAll ? 'Preparando…' : `Imprimir todas (${filteredWorkers.length})`}
              </button>
            )}
            {(activeTab === 'lista' || selectedWorker) && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                <Printer size={15} />
                Imprimir
              </button>
            )}
            {activeTab === 'individual' && selectedWorker && (
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 bg-secondary text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all duration-150 shadow-sm"
              >
                <Download size={15} />
                Exportar PDF por Cajera
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-muted/40 rounded-lg p-1 w-fit border border-border">
        <button
          onClick={() => setActiveTab('individual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'individual' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <User size={14} />
          Individual
        </button>
        <button
          onClick={() => setActiveTab('lista')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all ${activeTab === 'lista' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <List size={14} />
          Lista de Turnos
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-5 mb-6 shadow-sm">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4">
          {activeTab === 'individual' ? 'Seleccionar trabajadora' : 'Filtros'}
        </h2>
        <div className="flex flex-wrap gap-4">
          {/* Mes */}
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Mes
            </label>
            <div className="relative">
              <select
                value={exportMes}
                onChange={(e) => setExportMes(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
              >
                {MESES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
          <MultiSelect
            label="Sucursal"
            options={sucursales.map((s) => s.name)}
            selected={selectedSucursales}
            onChange={(v) => {
              setSelectedSucursales(v);
              setSelectedWorkerId('');
            }}
            allLabel="Todas"
            className={MULTI_WRAPPER}
            labelClassName={MULTI_LABEL}
            buttonClassName={MULTI_BUTTON}
          />
          <MultiSelect
            label="Área"
            options={areas}
            selected={selectedAreas}
            onChange={(v) => {
              setSelectedAreas(v);
              setSelectedWorkerId('');
            }}
            allLabel="Todas"
            className={MULTI_WRAPPER}
            labelClassName={MULTI_LABEL}
            buttonClassName={MULTI_BUTTON}
          />
          <MultiSelect
            label="Cargo"
            options={cargoOptions}
            selected={selectedCargos}
            onChange={(v) => {
              setSelectedCargos(v);
              setSelectedWorkerId('');
            }}
            allLabel="Todos"
            className={MULTI_WRAPPER}
            labelClassName={MULTI_LABEL}
            buttonClassName={MULTI_BUTTON}
          />
          {activeTab === 'individual' && (
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Buscar por nombre
              </label>
              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Escribe un nombre…"
                  className="w-full pl-9 pr-3 py-2.5 bg-input border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          )}
          {activeTab === 'individual' && (
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Trabajadora
              </label>
              <div className="relative">
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-input border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring pr-8"
                >
                  <option value="">
                    {filteredWorkers.length === 0 ? '— Sin resultados —' : '— Seleccionar —'}
                  </option>
                  {filteredWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.role || w.cargo})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
          )}
          {activeTab === 'individual' && (
            <div className="min-w-[200px]">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Versión a imprimir
              </label>
              <div className="flex gap-1 bg-muted/40 rounded-lg p-1 border border-border">
                <button
                  type="button"
                  onClick={() => setPrintVersion('trabajador')}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${printVersion === 'trabajador' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Trabajador/a
                </button>
                <button
                  type="button"
                  onClick={() => setPrintVersion('empresa')}
                  className={`flex-1 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${printVersion === 'empresa' ? 'bg-card text-foreground shadow-sm border border-border' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Empresa
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {printVersion === 'trabajador'
                  ? 'Imprime las 2 copias'
                  : 'Imprime solo la copia para firmar'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── LISTA DE TURNOS TAB ── */}
      {activeTab === 'lista' && (
        <div className="print-area">
          <GroupedListPrint
            workers={workers}
            shifts={shifts}
            scheduleData={scheduleData}
            monthLabel={exportMes}
            sucursales={selectedSucursales}
            areas={selectedAreas}
            cargos={selectedCargos}
          />
        </div>
      )}

      {/* ── INDIVIDUAL TAB ── */}
      {activeTab === 'individual' && (
        <>
          {!selectedWorker ? (
            <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col items-center justify-center py-20 text-center">
              <User size={48} className="text-muted-foreground/20 mb-3" />
              <p className="text-base font-semibold text-muted-foreground">
                Selecciona una trabajadora para ver su malla
              </p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Filtra por sucursal y área para encontrarla más rápido
              </p>
            </div>
          ) : (
            <>
              {/* Screen preview */}
              <div className="bg-card rounded-xl border border-border shadow-sm p-4 mb-4 hidden-on-print">
                <p className="text-xs text-muted-foreground mb-3 font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Calendar size={13} />
                  Vista previa del documento imprimible
                </p>
              </div>

              {/* ── PRINTABLE DOCUMENT ── */}
              <div className={printingAll ? '' : 'print-area'}>
                <MallaDocument
                  worker={selectedWorker}
                  monthLabel={exportMes}
                  schedule={workerSchedule}
                  specialDaysMap={workerSpecialDays}
                  shifts={shifts}
                  nonWorkingTypes={nonWorkingTypes}
                  printVersion={printVersion}
                  breakBefore={false}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* ── IMPRIMIR TODAS: solo se ve al imprimir ── */}
      {printingAll && (
        <div ref={bulkRef} className="print-area print-only">
          {filteredWorkers.map((w, i) => {
            const monthKey = monthLabelToKey(exportMes);
            return (
              <MallaDocument
                key={w.id}
                worker={w}
                monthLabel={exportMes}
                schedule={(scheduleData[monthKey] || {})[w.id] || Array(31).fill(null)}
                specialDaysMap={(specialDays[monthKey] || {})[w.id] || {}}
                shifts={shifts}
                nonWorkingTypes={nonWorkingTypes}
                printVersion={printVersion}
                breakBefore={i > 0}
              />
            );
          })}
        </div>
      )}

      <style>{`
        @page { size: letter portrait; margin: 8mm 10mm; }
        @media screen { .print-only { display: none !important; } }
        @media print {
          html, body { width: 215.9mm; height: 279.4mm; }
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .hidden-on-print { display: none !important; }
          .pdf-page { box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 4mm 8mm !important; margin: 0 !important; width: 100% !important; page-break-inside: avoid; }
          .pdf-page-break { page-break-before: always !important; break-before: page !important; margin-top: 0 !important; }
          .pdf-page img { height: 52px !important; }
          .pdf-page h1 { font-size: 14px !important; margin-bottom: 6px !important; }
          .pdf-page .text-xl { font-size: 13px !important; }
          .pdf-page .min-h-\\[60px\\] { min-height: 36px !important; }
          .pdf-page .text-2xl { font-size: 16px !important; }
          .pdf-page .mb-6 { margin-bottom: 4px !important; }
          .pdf-page .mb-4 { margin-bottom: 3px !important; }
          .pdf-page .mb-8 { margin-bottom: 4px !important; }
          .pdf-page .p-4 { padding: 4px !important; }
          .pdf-page .p-6 { padding: 6px !important; }
          .pdf-page .py-2 { padding-top: 3px !important; padding-bottom: 3px !important; }
          .pdf-page .py-3 { padding-top: 4px !important; padding-bottom: 4px !important; }
          .pdf-page .gap-6 { gap: 6px !important; }
          .pdf-page .gap-8 { gap: 8px !important; }
          .pdf-page .h-12 { height: 24px !important; }
          .pdf-page .mb-2 { margin-bottom: 2px !important; }
        }
      `}</style>
    </div>
  );
}

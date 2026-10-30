'use client';
import React, { useMemo, useState } from 'react';
import {
  BarChart2,
  ArrowDownToLine,
  ArrowUpFromLine,
  Package,
  CalendarDays,
  Printer,
} from 'lucide-react';
import { type ShiftCode, type Shift, type Worker, timeToMinutes } from '@/context/AppContext';
import { printElement } from '@/lib/printElement';

interface Props {
  workers: Worker[];
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
  shifts: Record<string, Shift>;
  totalCajas: number;
  daysInMonth: number;
  monthLabel: string;
  selectedCargo?: string;
  // Meses vecinos: para ver la semana completa cuando cruza de mes
  prevMonth?: NeighborMonth;
  nextMonth?: NeighborMonth;
}

interface NeighborMonth {
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
}

// Casillas para marcar a mano en la hoja impresa del día
// Cada casilla va al lado de la hora que le corresponde
const TIME_GROUPS = [
  { key: 'entrada', title: 'Entrada', check: 'Llegó', color: '#16a34a' },
  { key: 'colacion', title: 'Colación', check: 'Salió', color: '#7c3aed' },
  { key: 'salida', title: 'Salida', check: 'Se fue', color: '#dc2626' },
];
// Recuadros para anotar a mano los números de caja
const CAJA_BOXES = 4;
const GROUP_BORDER = '1.5px solid #9ca3af';
const TH: React.CSSProperties = {
  textAlign: 'center',
  padding: '4px 6px',
  borderBottom: '2px solid #d1d5db',
  fontWeight: '700',
  fontSize: '10px',
  textTransform: 'uppercase',
};
const TH_SUB: React.CSSProperties = {
  ...TH,
  fontSize: '9px',
  color: '#6b7280',
  padding: '2px 4px',
};
const TD: React.CSSProperties = { padding: '5px 6px', borderBottom: '1px solid #e5e7eb' };
const ORDER_BOX_STYLE: React.CSSProperties = {
  display: 'inline-block',
  width: '34px',
  height: '26px',
  border: '1.5px solid #374151',
  borderRadius: '3px',
};
const CAJA_BOX_STYLE: React.CSSProperties = {
  display: 'inline-block',
  width: '28px',
  height: '26px',
  border: '1px solid #6b7280',
  borderRadius: '2px',
  marginRight: '3px',
};
const CHECKBOX_STYLE: React.CSSProperties = {
  display: 'inline-block',
  width: '14px',
  height: '14px',
  border: '1.5px solid #374151',
  borderRadius: '3px',
};

interface HourRow {
  hour: string;
  entering: number;
  exiting: number;
  active: number;
  vacantCajas: number;
}

interface WorkerShiftDetail {
  name: string;
  sucursal: string;
  shiftLabel: string;
  start: string;
  end: string;
  colacion: number;
}

const HOUR_SLOTS = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
];
const MANANA_HOURS = ['06:00', '07:00', '08:00', '09:00', '10:00'];
const TARDE_HOURS = ['11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

function buildDayOptions(daysInMonth: number, monthLabel: string) {
  const options: { label: string; value: number }[] = [{ label: 'Todo el mes', value: -1 }];
  for (let d = 1; d <= daysInMonth; d++) {
    options.push({ label: `Día ${d} — ${monthLabel}`, value: d - 1 });
  }
  return options;
}

function buildWeekOptions(
  daysInMonth: number,
  monthLabel: string
): { label: string; startDay: number; endDay: number }[] {
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
  const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 0;
  const year = parseInt(parts[1] || '2026', 10);

  // Cada semana va de lunes a domingo completa: startDay puede ser < 1 (días del mes anterior)
  // y endDay > daysInMonth (días del mes siguiente)
  const weeks: { label: string; startDay: number; endDay: number }[] = [];
  let weekNum = 1;
  let d = 1;
  while (d <= daysInMonth) {
    const date = new Date(year, monthIdx, d);
    const dow = (date.getDay() + 6) % 7;
    const startDay = d - dow;
    const endDay = startDay + 6;
    const label =
      startDay < 1 || endDay > daysInMonth
        ? `${formatShortDate(year, monthIdx, startDay)} – ${formatShortDate(year, monthIdx, endDay)}`
        : `${startDay}–${endDay} ${parts[0]}`;
    weeks.push({ label: `Semana ${weekNum} (${label})`, startDay, endDay });
    weekNum++;
    d = endDay + 1;
  }
  return weeks;
}

const MONTH_SHORT = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

// "30 nov": día real aunque `day` se salga del mes (0 = último día del mes anterior, etc.)
function formatShortDate(year: number, monthIdx: number, day: number): string {
  const date = new Date(year, monthIdx, day);
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

// Datos del día `day` de la semana, que puede caer en el mes anterior o el siguiente
type DaySource = {
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
  dayIdx: number;
};

// Returns per-day, per-hour entry counts for a week range
function buildWeeklySummary(
  workers: Worker[],
  resolveDay: (day: number) => DaySource,
  shifts: Record<string, Shift>,
  startDay: number,
  endDay: number
): { day: number; hourMap: Record<string, number>; descanso: number }[] {
  const slotHour = (time: string) => parseInt(time.split(':')[0], 10);
  const result = [];
  for (let d = startDay; d <= endDay; d++) {
    const { scheduleData, specialDaysData, dayIdx } = resolveDay(d);
    const hourMap: Record<string, number> = {};
    HOUR_SLOTS.forEach((h) => {
      hourMap[h] = 0;
    });
    let descanso = 0;

    workers.forEach((w) => {
      const sched = scheduleData[w.id] || [];
      const workerSpecialDays = specialDaysData[w.id] || {};
      const shiftCode = sched[dayIdx];
      const specialDay = workerSpecialDays[dayIdx];
      if (shiftCode === 'DESC' || specialDay === 'DESCANSO') {
        descanso++;
        return;
      }
      if (specialDay) return;
      if (!shiftCode) return;
      const shift = shifts[shiftCode];
      if (!shift) return;
      const startH = slotHour(shift.start);
      HOUR_SLOTS.forEach((h) => {
        if (slotHour(h) === startH) hourMap[h]++;
      });
    });

    result.push({ day: d, hourMap, descanso });
  }
  return result;
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

// "Noviembre 2026" → [2026, 10]
function monthYear(monthLabel: string): [number, number] {
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
  return [parseInt(parts[1] || '2026', 10), MONTH_NAMES_MAP[parts[0]] ?? 0];
}

function getDayName(day: number, monthLabel: string): string {
  const [year, monthIdx] = monthYear(monthLabel);
  const date = new Date(year, monthIdx, day);
  return DAY_NAMES[(date.getDay() + 6) % 7];
}

// Hoja de un día: lista de trabajadoras con turno, casillas para marcar y HE.
// La usan la impresión por día y la por semana (una hoja por día), para que sean iguales.
const startMins = (w: WorkerShiftDetail) => {
  const [h, m] = (w.start || '00:00').split(':').map(Number);
  return h * 60 + (m || 0);
};
const isTardeShift = (w: WorkerShiftDetail) => startMins(w) >= 11 * 60;
const HOUR_GROUP_ROW_STYLE: React.CSSProperties = { borderTop: '2px solid #374151' };
const TOTAL_ROW_STYLE: React.CSSProperties = {
  padding: '4px 10px',
  textAlign: 'right',
  fontWeight: '700',
  fontSize: '11px',
  background: '#f3f4f6',
  borderBottom: '1px solid #d1d5db',
};

function DaySheet({
  workerDetails,
  showCajas,
}: {
  workerDetails: WorkerShiftDetail[];
  /** Recuadros de N° de caja: solo cuando el filtro es de cajeras */
  showCajas: boolean;
}) {
  // Columna de sucursal solo si la hoja mezcla varias sucursales
  const multiSucursal = new Set(workerDetails.map((w) => w.sucursal)).size > 1;
  // Orden, Nombre, (Sucursal), (Cajas), 3 × (hora + casilla), HE
  const dayColumnCount =
    2 + (multiSucursal ? 1 : 0) + (showCajas ? 1 : 0) + TIME_GROUPS.length * 2 + 1;
  // Totales de mañana y tarde (la lista viene ordenada por hora de entrada)
  const mananaCount = workerDetails.filter((w) => !isTardeShift(w)).length;
  const tardeCount = workerDetails.length - mananaCount;
  return (
    <>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th rowSpan={2} style={{ ...TH, width: '34px' }}>
              Orden
            </th>
            <th rowSpan={2} style={{ ...TH, textAlign: 'left', padding: '4px 8px' }}>
              Nombre
            </th>
            {multiSucursal && (
              <th rowSpan={2} style={{ ...TH, textAlign: 'left' }}>
                Sucursal
              </th>
            )}
            {showCajas && (
              <th rowSpan={2} style={{ ...TH, borderLeft: GROUP_BORDER }}>
                N° de caja
              </th>
            )}
            {TIME_GROUPS.map((g) => (
              <th
                key={`grp-${g.key}`}
                colSpan={2}
                style={{
                  ...TH,
                  color: g.color,
                  borderLeft: GROUP_BORDER,
                  borderBottom: '1px solid #d1d5db',
                }}
              >
                {g.title}
              </th>
            ))}
            <th rowSpan={2} style={{ ...TH, width: '56px', borderLeft: GROUP_BORDER }}>
              HE
            </th>
          </tr>
          <tr style={{ background: '#f3f4f6' }}>
            {TIME_GROUPS.map((g) => (
              <React.Fragment key={`sub-${g.key}`}>
                <th style={{ ...TH_SUB, borderLeft: GROUP_BORDER }}>Hora</th>
                <th style={TH_SUB}>{g.check}</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {workerDetails.map((wd, i) => {
            const isTarde = isTardeShift(wd);
            const isFirstTarde = isTarde && tardeCount > 0 && i === mananaCount;
            const isLastManana = !isTarde && i === mananaCount - 1;
            const isLast = i === workerDetails.length - 1;
            // Línea más marcada cuando cambia la hora de entrada (agrupa los de la misma hora)
            const newHour =
              i > 0 && !isFirstTarde && startMins(workerDetails[i - 1]) !== startMins(wd);
            const times: Record<string, string> = {
              entrada: wd.start,
              colacion: wd.colacion === 0 ? '0' : `${wd.colacion} min`,
              salida: wd.end,
            };
            return (
              <React.Fragment key={`day-row-${i}`}>
                {isFirstTarde && (
                  <tr>
                    <td
                      colSpan={dayColumnCount}
                      style={{
                        padding: '6px 10px',
                        background: '#fff7ed',
                        borderBottom: '1px solid #fed7aa',
                        borderTop: '2px solid #fb923c',
                        fontWeight: '700',
                        fontSize: '10px',
                        color: '#c2410c',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      — Tarde (desde 11:00) —
                    </td>
                  </tr>
                )}
                <tr style={newHour ? HOUR_GROUP_ROW_STYLE : undefined}>
                  <td style={{ ...TD, textAlign: 'center' }}>
                    <span style={ORDER_BOX_STYLE} />
                  </td>
                  <td style={{ ...TD, padding: '5px 8px', fontWeight: '600' }}>{wd.name}</td>
                  {multiSucursal && (
                    <td style={{ ...TD, fontSize: '10px', color: '#4b5563' }}>{wd.sucursal}</td>
                  )}
                  {showCajas && (
                    <td
                      style={{
                        ...TD,
                        borderLeft: GROUP_BORDER,
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                      }}
                    >
                      {Array.from({ length: CAJA_BOXES }, (_, k) => (
                        <span key={k} style={CAJA_BOX_STYLE} />
                      ))}
                    </td>
                  )}
                  {TIME_GROUPS.map((g) => (
                    <React.Fragment key={`t-${i}-${g.key}`}>
                      <td
                        style={{
                          ...TD,
                          borderLeft: GROUP_BORDER,
                          textAlign: 'center',
                          fontWeight: '700',
                          color: g.color,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {times[g.key]}
                      </td>
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <span style={CHECKBOX_STYLE} />
                      </td>
                    </React.Fragment>
                  ))}
                  <td style={{ ...TD, borderLeft: GROUP_BORDER }} />
                </tr>
                {isLastManana && (
                  <tr>
                    <td colSpan={dayColumnCount} style={TOTAL_ROW_STYLE}>
                      Total mañana: {mananaCount}
                    </td>
                  </tr>
                )}
                {isTarde && isLast && (
                  <tr>
                    <td colSpan={dayColumnCount} style={TOTAL_ROW_STYLE}>
                      Total tarde: {tardeCount}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div
        style={{
          marginTop: '8px',
          fontSize: '10px',
          color: '#6b7280',
          borderTop: '2px solid #d1d5db',
          paddingTop: '6px',
        }}
      >
        Total del día: <strong>{workerDetails.length}</strong> (mañana {mananaCount} · tarde{' '}
        {tardeCount})
        <span style={{ marginLeft: '16px' }}>
          Orden: anotar en qué orden llegaron. Marcar ✓ al llegar, al salir a colación y al irse.
          HE: anotar horas extra del día.
        </span>
      </div>
      <HourlyCountStrip workerDetails={workerDetails} />
    </>
  );
}

// Cuántas hay trabajando a cada hora en punto (la que sale a esa hora ya no cuenta)
function HourlyCountStrip({ workerDetails }: { workerDetails: WorkerShiftDetail[] }) {
  const turnos = workerDetails
    .filter((w) => w.start && w.end)
    .map((w) => {
      const start = timeToMinutes(w.start);
      let end = timeToMinutes(w.end);
      if (end <= start) end += 1440;
      return { start, end };
    })
    .filter((t) => Number.isFinite(t.start) && Number.isFinite(t.end));
  if (turnos.length === 0) return null;
  const from = Math.floor(Math.min(...turnos.map((t) => t.start)) / 60);
  const to = Math.floor(Math.max(...turnos.map((t) => t.end)) / 60);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const counts = hours.map((h) => turnos.filter((t) => t.start <= h * 60 && t.end > h * 60).length);
  const max = Math.max(...counts);
  const cell: React.CSSProperties = {
    border: '1px solid #9ca3af',
    padding: '3px 2px',
    textAlign: 'center',
  };
  return (
    <div style={{ marginTop: '10px', breakInside: 'avoid' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', marginBottom: '3px' }}>
        Trabajando a cada hora
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
        <tbody>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ ...cell, textAlign: 'left', padding: '3px 6px' }}>Hora</th>
            {hours.map((h) => (
              <th key={h} style={cell}>
                {String(h % 24).padStart(2, '0')}:00
              </th>
            ))}
          </tr>
          <tr>
            <th style={{ ...cell, textAlign: 'left', padding: '3px 6px' }}>Personas</th>
            {counts.map((n, i) => (
              <td
                key={hours[i]}
                style={{
                  ...cell,
                  fontSize: '12px',
                  fontWeight: '700',
                  background: n === max ? '#dbeafe' : undefined,
                }}
              >
                {n}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function MallaSummary({
  workers,
  scheduleData,
  specialDaysData,
  shifts,
  totalCajas,
  daysInMonth,
  monthLabel,
  selectedCargo = 'Todos',
  prevMonth,
  nextMonth,
}: Props) {
  const [selectedDay, setSelectedDay] = useState<number>(-1);
  const [printMode, setPrintMode] = useState<'day' | 'week'>('week');
  const [selectedWeekIdx, setSelectedWeekIdx] = useState<number>(0);

  const dayOptions = useMemo(
    () => buildDayOptions(daysInMonth, monthLabel),
    [daysInMonth, monthLabel]
  );
  const weekOptions = useMemo(
    () => buildWeekOptions(daysInMonth, monthLabel),
    [daysInMonth, monthLabel]
  );

  const cajasOnlyCargo = selectedCargo === 'Cajera';

  // Días de la semana fuera del mes: se leen del mes anterior o siguiente
  const resolveDay = (day: number): DaySource => {
    if (day < 1) {
      const [year, monthIdx] = monthYear(monthLabel);
      const prevDays = new Date(year, monthIdx, 0).getDate();
      return {
        scheduleData: prevMonth?.scheduleData ?? {},
        specialDaysData: prevMonth?.specialDaysData ?? {},
        dayIdx: prevDays + day - 1,
      };
    }
    if (day > daysInMonth) {
      return {
        scheduleData: nextMonth?.scheduleData ?? {},
        specialDaysData: nextMonth?.specialDaysData ?? {},
        dayIdx: day - daysInMonth - 1,
      };
    }
    return { scheduleData, specialDaysData, dayIdx: day - 1 };
  };
  const isOtherMonth = (day: number) => day < 1 || day > daysInMonth;
  // Columnas de otro mes: en gris y más tenues, para que se note que no son de este mes
  const otherMonthCell = (day: number): React.CSSProperties | undefined =>
    isOtherMonth(day) ? { background: '#f1f5f9', opacity: 0.7 } : undefined;
  const realDayNum = (day: number) => {
    const [year, monthIdx] = monthYear(monthLabel);
    return new Date(year, monthIdx, day).getDate();
  };
  const otherMonthShort = (day: number) => {
    const [year, monthIdx] = monthYear(monthLabel);
    return MONTH_SHORT[new Date(year, monthIdx, day).getMonth()];
  };

  const summary = useMemo((): HourRow[] => {
    const targetWorkers = workers;
    const slotHour = (time: string) => parseInt(time.split(':')[0], 10);

    const rows: HourRow[] = HOUR_SLOTS.map((hour) => {
      const slotH = slotHour(hour);
      let entering = 0;
      let exiting = 0;
      let active = 0;

      targetWorkers.forEach((w) => {
        const sched = scheduleData[w.id] || [];
        const workerSpecialDays = specialDaysData[w.id] || {};

        if (selectedDay >= 0) {
          // Single day: skip if worker has any special day entry
          const specialDay = workerSpecialDays[selectedDay];
          if (specialDay) return;
          const shiftCode = sched[selectedDay];
          if (!shiftCode || shiftCode === 'DESC') return;
          const shift = shifts[shiftCode];
          if (!shift) return;
          const startH = slotHour(shift.start);
          const endH = slotHour(shift.end);
          if (startH === slotH) entering++;
          if (endH === slotH) exiting++;
          if (startH <= slotH && endH > slotH) active++;
        } else {
          // All month: iterate each day index
          sched.forEach((shiftCode, dayIdx) => {
            const specialDay = workerSpecialDays[dayIdx];
            if (specialDay) return;
            if (!shiftCode || shiftCode === 'DESC') return;
            const shift = shifts[shiftCode];
            if (!shift) return;
            const startH = slotHour(shift.start);
            const endH = slotHour(shift.end);
            if (startH === slotH) entering++;
            if (endH === slotH) exiting++;
            if (startH <= slotH && endH > slotH) active++;
          });
        }
      });

      const vacantCajas = cajasOnlyCargo ? Math.max(0, totalCajas - active) : 0;
      return { hour, entering, exiting, active, vacantCajas };
    });

    return rows.filter((r) => r.entering > 0 || r.exiting > 0);
  }, [workers, scheduleData, specialDaysData, shifts, totalCajas, selectedDay, cajasOnlyCargo]);

  const descansoCount = useMemo((): number => {
    let count = 0;
    workers.forEach((w) => {
      const sched = scheduleData[w.id] || [];
      const workerSpecialDays = specialDaysData[w.id] || {};
      if (selectedDay >= 0) {
        if (sched[selectedDay] === 'DESC' || workerSpecialDays[selectedDay] === 'DESCANSO') count++;
      } else {
        sched.forEach((code) => {
          if (code === 'DESC') count++;
        });
        Object.values(workerSpecialDays).forEach((code) => {
          if (code === 'DESCANSO') count++;
        });
      }
    });
    return count;
  }, [workers, scheduleData, specialDaysData, selectedDay]);

  const perDayDescanso = useMemo((): { day: number; count: number }[] => {
    const result: { day: number; count: number }[] = [];
    for (let d = 0; d < daysInMonth; d++) {
      let count = 0;
      workers.forEach((w) => {
        const sched = scheduleData[w.id] || [];
        const workerSpecialDays = specialDaysData[w.id] || {};
        if (sched[d] === 'DESC' || workerSpecialDays[d] === 'DESCANSO') count++;
      });
      if (count > 0) result.push({ day: d + 1, count });
    }
    return result;
  }, [workers, scheduleData, specialDaysData, daysInMonth]);

  const perDayMTD = useMemo((): {
    day: number;
    manana: number;
    tarde: number;
    descanso: number;
    colaciones: number[];
  }[] => {
    const toMins = (t: string) => {
      const [h, m] = (t || '00:00').split(':').map(Number);
      return h * 60 + (m || 0);
    };
    const result: {
      day: number;
      manana: number;
      tarde: number;
      descanso: number;
      colaciones: number[];
    }[] = [];
    for (let d = 0; d < daysInMonth; d++) {
      let manana = 0;
      let tarde = 0;
      let descanso = 0;
      const colacionSet = new Set<number>();
      workers.forEach((w) => {
        const sched = scheduleData[w.id] || [];
        const workerSpecialDays = specialDaysData[w.id] || {};
        const shiftCode = sched[d];
        const specialDay = workerSpecialDays[d];
        if (shiftCode === 'DESC' || specialDay === 'DESCANSO') {
          descanso++;
          return;
        }
        if (specialDay) return;
        if (!shiftCode) return;
        const shift = shifts[shiftCode];
        if (!shift) return;
        const startMins = toMins(shift.start);
        if (startMins <= 600) manana++;
        else tarde++;
        if ((shift.colacion || 0) > 0) colacionSet.add(shift.colacion);
      });
      result.push({
        day: d + 1,
        manana,
        tarde,
        descanso,
        colaciones: Array.from(colacionSet).sort((a, b) => a - b),
      });
    }
    return result;
  }, [workers, scheduleData, specialDaysData, shifts, daysInMonth]);

  const workerDetails = useMemo((): WorkerShiftDetail[] => {
    if (selectedDay < 0) return [];
    const details: WorkerShiftDetail[] = [];
    workers.forEach((w) => {
      const sched = scheduleData[w.id] || [];
      const workerSpecialDays = specialDaysData[w.id] || {};
      // Skip workers with any special day (DESCANSO, VACACIONES, LICENCIA, etc.)
      const specialDay = workerSpecialDays[selectedDay];
      if (specialDay) return;
      const shiftCode = sched[selectedDay];
      if (!shiftCode || shiftCode === 'DESC') return;
      const shift = shifts[shiftCode];
      if (!shift) return;
      details.push({
        name: w.name,
        sucursal: w.sucursal,
        shiftLabel: shift.label,
        start: shift.start,
        end: shift.end,
        colacion: (shift as { colacion?: number }).colacion ?? 0,
      });
    });
    details.sort((a, b) => {
      const toMins = (t: string) => {
        const [h, m] = (t || '00:00').split(':').map(Number);
        return h * 60 + (m || 0);
      };
      const diff = toMins(a.start) - toMins(b.start);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
    return details;
  }, [workers, scheduleData, specialDaysData, shifts, selectedDay]);

  const weekWorkerDetails = useMemo(() => {
    const wk = weekOptions[selectedWeekIdx];
    if (!wk) return [];
    const result: { day: number; workers: WorkerShiftDetail[] }[] = [];
    for (let d = wk.startDay; d <= wk.endDay; d++) {
      const { scheduleData, specialDaysData, dayIdx } = resolveDay(d);
      const dayWorkers: WorkerShiftDetail[] = [];
      workers.forEach((w) => {
        const sched = scheduleData[w.id] || [];
        const workerSpecialDays = specialDaysData[w.id] || {};
        // Skip workers with any special day (DESCANSO, VACACIONES, LICENCIA, etc.)
        const specialDay = workerSpecialDays[dayIdx];
        if (specialDay) return;
        const shiftCode = sched[dayIdx];
        if (!shiftCode || shiftCode === 'DESC') return;
        const shift = shifts[shiftCode];
        if (!shift) return;
        dayWorkers.push({
          name: w.name,
          sucursal: w.sucursal,
          shiftLabel: shift.label,
          start: shift.start,
          end: shift.end,
          colacion: (shift as { colacion?: number }).colacion ?? 0,
        });
      });
      dayWorkers.sort((a, b) => {
        const toMins = (t: string) => {
          const [h, m] = (t || '00:00').split(':').map(Number);
          return h * 60 + (m || 0);
        };
        const diff = toMins(a.start) - toMins(b.start);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      });
      result.push({ day: d, workers: dayWorkers });
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workers,
    scheduleData,
    specialDaysData,
    prevMonth,
    nextMonth,
    shifts,
    weekOptions,
    selectedWeekIdx,
  ]);

  const weeklySummary = useMemo(() => {
    const wk = weekOptions[selectedWeekIdx];
    if (!wk) return [];
    return buildWeeklySummary(workers, resolveDay, shifts, wk.startDay, wk.endDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workers,
    scheduleData,
    specialDaysData,
    prevMonth,
    nextMonth,
    shifts,
    weekOptions,
    selectedWeekIdx,
  ]);

  // Se imprime solo la hoja (del día o de la semana), armada aparte: así no salen hojas de
  // más (ni en blanco) por el resto de la página de Malla
  const handlePrint = () => {
    const report = document.getElementById('malla-print-report');
    if (!report) return;
    const title =
      printMode === 'day'
        ? `Horario ${selectedDay >= 0 ? `día ${selectedDay + 1}` : ''} ${monthLabel}`
        : `Horario semanal ${weekOptions[selectedWeekIdx]?.label ?? ''}`;
    printElement(report, { title });
  };

  if (workers.length === 0) return null;

  const cargoLabel =
    selectedCargo === 'Cajera'
      ? 'Cajeras'
      : selectedCargo === 'Jefa de Caja'
        ? 'Jefas de Caja'
        : 'Todos los cargos';

  // ── Weekly grouped table helpers ──
  const wk = weekOptions[selectedWeekIdx];
  const weekDays = wk
    ? Array.from({ length: wk.endDay - wk.startDay + 1 }, (_, i) => wk.startDay + i)
    : [];

  // For each hour and day, get entry count
  const getCount = (day: number, hour: string): number => {
    const dayData = weeklySummary.find((d) => d.day === day);
    return dayData ? (dayData.hourMap[hour] ?? 0) : 0;
  };

  // Row total across all days for a given hour
  const getHourTotal = (hour: string): number =>
    weekDays.reduce((sum, day) => sum + getCount(day, hour), 0);

  // Subtotal per day for a block of hours
  const getBlockDayTotal = (day: number, hours: string[]): number =>
    hours.reduce((sum, h) => sum + getCount(day, h), 0);

  // Grand total per day (mañana + tarde)
  const getDayGrandTotal = (day: number): number =>
    getBlockDayTotal(day, MANANA_HOURS) + getBlockDayTotal(day, TARDE_HOURS);

  // Descanso per day
  const getDescanso = (day: number): number => {
    const dayData = weeklySummary.find((d) => d.day === day);
    return dayData ? dayData.descanso : 0;
  };

  // Filter hours that have at least one entry across the week
  const activeMananaHours = MANANA_HOURS.filter((h) => getHourTotal(h) > 0);
  const activeTardeHours = TARDE_HOURS.filter((h) => getHourTotal(h) > 0);

  return (
    <>
      {/* ── Print-only report ── */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 15mm 12mm;
          }
          body, html {
            margin: 0 !important;
            padding: 0 !important;
          }
          body * { visibility: hidden !important; }
          #malla-print-report, #malla-print-report * { visibility: visible !important; }
          #malla-print-report {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            z-index: 9999 !important;
            overflow: visible !important;
          }
          #malla-print-report table {
            page-break-inside: auto;
          }
          #malla-print-report tr {
            page-break-inside: avoid;
          }
          #malla-print-report .week-day-block {
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div id="malla-print-report" className="hidden print:block">
        <div style={{ fontFamily: 'sans-serif', color: '#111' }}>
          {printMode === 'day' ? (
            <>
              <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>
                Horario — {selectedDay >= 0 ? `Día ${selectedDay + 1}` : 'Todo el mes'}
              </h1>
              <p style={{ fontSize: '11px', color: '#555', marginBottom: '12px' }}>{monthLabel}</p>
              {workerDetails.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#888' }}>
                  No hay turnos asignados para este día.
                </p>
              ) : (
                <DaySheet workerDetails={workerDetails} showCajas={cajasOnlyCargo} />
              )}
            </>
          ) : (
            <>
              {weekWorkerDetails.map(({ day, workers: dayWorkers }, dayIdx) => {
                return (
                  <div
                    key={`week-day-${day}`}
                    className="week-day-block"
                    // Cada día en su propia hoja, igual que la impresión por día
                    style={{
                      marginBottom: '18px',
                      breakAfter: dayIdx < weekWorkerDetails.length - 1 ? 'page' : 'auto',
                    }}
                  >
                    <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>
                      Horario — {getDayName(day, monthLabel)} {realDayNum(day)}
                      {isOtherMonth(day) && ` ${otherMonthShort(day)}`}
                    </h2>
                    <p style={{ fontSize: '11px', color: '#555', marginBottom: '12px' }}>
                      {monthLabel} · {weekOptions[selectedWeekIdx]?.label || ''}
                    </p>
                    {dayWorkers.length === 0 ? (
                      <p style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '6px' }}>
                        Sin turnos asignados
                      </p>
                    ) : (
                      <DaySheet workerDetails={dayWorkers} showCajas={cajasOnlyCargo} />
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Screen card ── */}
      <div className="bg-card rounded-xl border border-border shadow-sm">
        <div className="px-5 py-3 border-b border-border flex flex-wrap items-center gap-3">
          <BarChart2 size={16} className="text-secondary" />
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Resumen por Horario
          </h2>

          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
              selectedCargo === 'Cajera'
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : selectedCargo === 'Jefa de Caja'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-muted text-muted-foreground border-border'
            }`}
          >
            {cargoLabel}
          </span>

          {/* Print controls */}
          <div className="flex items-center flex-wrap gap-2 ml-auto">
            <div className="flex items-center rounded-lg border border-border overflow-hidden text-xs">
              <button
                onClick={() => setPrintMode('day')}
                className={`px-2.5 py-1.5 font-medium transition-colors ${printMode === 'day' ? 'bg-secondary text-white' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
              >
                Por día
              </button>
              <button
                onClick={() => setPrintMode('week')}
                className={`px-2.5 py-1.5 font-medium transition-colors ${printMode === 'week' ? 'bg-secondary text-white' : 'bg-background text-muted-foreground hover:bg-muted/50'}`}
              >
                Por semana
              </button>
            </div>

            {printMode === 'week' && (
              <select
                value={selectedWeekIdx}
                onChange={(e) => setSelectedWeekIdx(Number(e.target.value))}
                className="pl-2 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
              >
                {weekOptions.map((wk, idx) => (
                  <option key={`wk-opt-${idx}`} value={idx}>
                    {wk.label}
                  </option>
                ))}
              </select>
            )}

            {printMode === 'day' && (
              <div className="flex items-center gap-2">
                <CalendarDays size={14} className="text-muted-foreground" />
                <select
                  value={selectedDay}
                  onChange={(e) => setSelectedDay(Number(e.target.value))}
                  className="pl-2 pr-3 py-1.5 bg-background border border-border rounded-lg text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
                >
                  {dayOptions.map((opt) => (
                    <option key={`day-opt-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 border bg-secondary text-white border-secondary hover:bg-blue-700 active:scale-95 shadow-sm"
            >
              <Printer size={13} />
              Imprimir
            </button>
          </div>
        </div>

        {/* ── WEEKLY VIEW: grouped Mañana / Tarde table ── */}
        {printMode === 'week' ? (
          <div className="overflow-x-auto w-full">
            {weeklySummary.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                No hay turnos asignados para esta semana.
              </div>
            ) : (
              <table className="w-full border-collapse text-xs" style={{ minWidth: '480px' }}>
                <thead>
                  {/* Row 1: "Hora / Fecha" + day names + Total */}
                  <tr className="border-b-2 border-border" style={{ background: '#dbeafe' }}>
                    <th
                      colSpan={2}
                      className="text-center px-3 py-2 font-bold text-blue-800 border-r border-blue-300"
                      style={{ minWidth: '100px' }}
                    >
                      Hora
                    </th>
                    {weekDays.map((day) =>
                      isOtherMonth(day) ? (
                        <th
                          key={`hd-${day}`}
                          className="text-center px-2 py-1 font-bold text-slate-500 border-r border-blue-200"
                          style={{ minWidth: '52px', background: '#e2e8f0' }}
                          title="Día de otro mes"
                        >
                          <div className="text-[11px] font-bold">{getDayName(day, monthLabel)}</div>
                          <div className="text-[10px] font-normal">
                            {realDayNum(day)}{' '}
                            <span className="uppercase font-semibold">{otherMonthShort(day)}</span>
                          </div>
                        </th>
                      ) : (
                        <th
                          key={`hd-${day}`}
                          className="text-center px-2 py-1 font-bold text-blue-800 border-r border-blue-200"
                          style={{ minWidth: '52px' }}
                        >
                          <div className="text-[11px] font-bold">{getDayName(day, monthLabel)}</div>
                          <div className="text-[10px] font-normal text-blue-600">{day}</div>
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {/* ── MAÑANA BLOCK ── */}
                  {activeMananaHours.map((hour, i) => (
                    <tr
                      key={`m-${hour}`}
                      className="border-b border-blue-100"
                      style={{ background: i % 2 === 0 ? '#eff6ff' : '#dbeafe33' }}
                    >
                      {/* Block label: only on first row, rowspan */}
                      {i === 0 && (
                        <td
                          rowSpan={activeMananaHours.length}
                          className="text-center font-bold text-blue-700 border-r border-blue-200 align-middle"
                          style={{
                            background: '#bfdbfe',
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            padding: '8px 6px',
                            fontSize: '12px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Mañana
                        </td>
                      )}
                      {/* Hour number */}
                      <td
                        className="text-center px-3 py-2 font-bold text-blue-800 border-r border-blue-200"
                        style={{ background: '#dbeafe' }}
                      >
                        {hour.replace(':00', '')}
                      </td>
                      {/* Day counts */}
                      {weekDays.map((day) => {
                        const val = getCount(day, hour);
                        return (
                          <td
                            key={`mc-${day}-${hour}`}
                            style={otherMonthCell(day)}
                            className="text-center px-2 py-2 border-r border-blue-100"
                          >
                            {val > 0 ? (
                              <span className="font-bold text-blue-900 text-[13px]">{val}</span>
                            ) : (
                              <span className="text-blue-200 text-[11px]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Mañana subtotal row */}
                  <tr className="border-b-2 border-blue-300" style={{ background: '#bfdbfe' }}>
                    <td
                      colSpan={2}
                      className="text-center px-3 py-2 font-bold text-blue-800 text-[11px] uppercase tracking-wide border-r border-blue-300"
                    >
                      Total Mañana
                    </td>
                    {weekDays.map((day) => (
                      <td
                        key={`mst-${day}`}
                        style={otherMonthCell(day)}
                        className="text-center px-2 py-2 border-r border-blue-200"
                      >
                        <span className="font-bold text-blue-900 text-[13px]">
                          {getBlockDayTotal(day, MANANA_HOURS)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* ── TARDE BLOCK ── */}
                  {activeTardeHours.map((hour, i) => (
                    <tr
                      key={`t-${hour}`}
                      className="border-b border-orange-100"
                      style={{ background: i % 2 === 0 ? '#fff7ed' : '#fed7aa33' }}
                    >
                      {i === 0 && (
                        <td
                          rowSpan={activeTardeHours.length}
                          className="text-center font-bold text-orange-700 border-r border-orange-200 align-middle"
                          style={{
                            background: '#fed7aa',
                            writingMode: 'vertical-rl',
                            transform: 'rotate(180deg)',
                            padding: '8px 6px',
                            fontSize: '12px',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Tarde
                        </td>
                      )}
                      <td
                        className="text-center px-3 py-2 font-bold text-orange-800 border-r border-orange-200"
                        style={{ background: '#ffedd5' }}
                      >
                        {hour.replace(':00', '')}
                      </td>
                      {weekDays.map((day) => {
                        const val = getCount(day, hour);
                        return (
                          <td
                            key={`tc-${day}-${hour}`}
                            style={otherMonthCell(day)}
                            className="text-center px-2 py-2 border-r border-orange-100"
                          >
                            {val > 0 ? (
                              <span className="font-bold text-orange-900 text-[13px]">{val}</span>
                            ) : (
                              <span className="text-orange-200 text-[11px]">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {/* Tarde subtotal row */}
                  <tr className="border-b-2 border-orange-300" style={{ background: '#fed7aa' }}>
                    <td
                      colSpan={2}
                      className="text-center px-3 py-2 font-bold text-orange-800 text-[11px] uppercase tracking-wide border-r border-orange-300"
                    >
                      Total Tarde
                    </td>
                    {weekDays.map((day) => (
                      <td
                        key={`tst-${day}`}
                        style={otherMonthCell(day)}
                        className="text-center px-2 py-2 border-r border-orange-200"
                      >
                        <span className="font-bold text-orange-900 text-[13px]">
                          {getBlockDayTotal(day, TARDE_HOURS)}
                        </span>
                      </td>
                    ))}
                  </tr>

                  {/* ── DESCANSO ROW ── */}
                  <tr className="border-b border-slate-200" style={{ background: '#f1f5f9' }}>
                    <td
                      colSpan={2}
                      className="text-center px-3 py-2 font-bold text-slate-600 text-[11px] uppercase tracking-wide border-r border-slate-300"
                    >
                      🌙 Descanso
                    </td>
                    {weekDays.map((day) => {
                      const val = getDescanso(day);
                      return (
                        <td
                          key={`desc-${day}`}
                          style={otherMonthCell(day)}
                          className="text-center px-2 py-2 border-r border-slate-200"
                        >
                          {val > 0 ? (
                            <span className="font-bold text-slate-700 text-[13px]">{val}</span>
                          ) : (
                            <span className="text-slate-300 text-[11px]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>

                  {/* ── GRAND TOTAL ROW ── */}
                  <tr style={{ background: '#fef9c3' }}>
                    <td
                      colSpan={2}
                      className="text-center px-3 py-2.5 font-bold text-yellow-800 text-[12px] uppercase tracking-wide border-r border-yellow-300"
                    >
                      Total
                    </td>
                    {weekDays.map((day) => (
                      <td
                        key={`gt-${day}`}
                        style={otherMonthCell(day)}
                        className="text-center px-2 py-2.5 border-r border-yellow-200"
                      >
                        <span className="font-bold text-yellow-900 text-[14px]">
                          {getDayGrandTotal(day)}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
            {weekDays.some(isOtherMonth) && (
              <p className="px-5 py-2 text-[11px] text-muted-foreground">
                Las columnas en gris son días de otro mes.
              </p>
            )}
          </div>
        ) : summary.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">
            No hay turnos asignados{' '}
            {selectedDay >= 0 ? `para el día ${selectedDay + 1}` : 'este mes'}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Hora
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-green-600 uppercase tracking-wider">
                    <span className="flex items-center justify-center gap-1">
                      <ArrowDownToLine size={12} />
                      Entran
                    </span>
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-red-500 uppercase tracking-wider">
                    <span className="flex items-center justify-center gap-1">
                      <ArrowUpFromLine size={12} />
                      Salen
                    </span>
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-semibold text-blue-600 uppercase tracking-wider">
                    Activas
                  </th>
                  {cajasOnlyCargo && (
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-orange-500 uppercase tracking-wider">
                      <span className="flex items-center justify-center gap-1">
                        <Package size={12} />
                        Cajas vacías
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {summary.map((row, i) => (
                  <tr
                    key={row.hour}
                    className={`border-b border-border/50 ${i % 2 === 0 ? '' : 'bg-muted/5'}`}
                  >
                    <td className="px-4 py-2.5 font-bold text-foreground">{row.hour}</td>
                    <td className="px-4 py-2.5 text-center">
                      {row.entering > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg bg-green-100 text-green-700 font-bold text-sm">
                          {row.entering}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {row.exiting > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg bg-red-100 text-red-600 font-bold text-sm">
                          {row.exiting}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg bg-blue-100 text-blue-700 font-bold text-sm">
                        {row.active}
                      </span>
                    </td>
                    {cajasOnlyCargo && (
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg font-bold text-sm ${row.vacantCajas > 5 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {row.vacantCajas}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-slate-50/60">
                  <td className="px-4 py-2.5 font-bold text-slate-600 text-xs uppercase tracking-wide">
                    🌙 Descanso
                  </td>
                  <td colSpan={cajasOnlyCargo ? 4 : 3} className="px-4 py-2.5">
                    {selectedDay >= 0 ? (
                      <span className="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-lg bg-slate-200 text-slate-700 font-bold text-sm">
                        {descansoCount}
                      </span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {perDayDescanso.length === 0 ? (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        ) : (
                          perDayDescanso.map(({ day, count }) => (
                            <span
                              key={`desc-day-${day}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[11px] font-semibold"
                            >
                              <span className="text-slate-500 font-normal">d{day}</span>
                              <span>{count}</span>
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ── Mañana / Tarde / Descanso per-day breakdown ── */}
            <div className="border-t-2 border-border">
              <div className="px-4 py-2 bg-muted/10 border-b border-border flex items-center gap-2">
                <CalendarDays size={13} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {selectedDay >= 0
                    ? `Distribución — Día ${selectedDay + 1}`
                    : 'Distribución por día'}
                </span>
              </div>
              {selectedDay >= 0 ? (
                <div className="px-4 py-3 flex flex-wrap gap-3">
                  {(() => {
                    const d = perDayMTD[selectedDay];
                    if (!d) return null;
                    return (
                      <>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                          <span className="text-sm">🌅</span>
                          <div>
                            <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                              Mañana
                            </div>
                            <div className="text-lg font-bold text-amber-700">{d.manana}</div>
                            <div className="text-[9px] text-amber-500">hasta 10:00</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 border border-orange-200">
                          <span className="text-sm">🌇</span>
                          <div>
                            <div className="text-[10px] font-semibold text-orange-600 uppercase tracking-wide">
                              Tarde
                            </div>
                            <div className="text-lg font-bold text-orange-700">{d.tarde}</div>
                            <div className="text-[9px] text-orange-500">desde 11:00</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                          <span className="text-sm">🌙</span>
                          <div>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                              Descanso
                            </div>
                            <div className="text-lg font-bold text-slate-600">{d.descanso}</div>
                          </div>
                        </div>
                        {d.colaciones.length > 0 && (
                          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 border border-purple-200">
                            <span className="text-sm">🍽</span>
                            <div>
                              <div className="text-[10px] font-semibold text-purple-600 uppercase tracking-wide">
                                Colación
                              </div>
                              <div className="text-lg font-bold text-purple-700">
                                {d.colaciones.map((c) => `${c}m`).join(' / ')}
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-muted/10 border-b border-border">
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-10 border-r border-border/50">
                          Día
                        </th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-amber-600 uppercase tracking-wide">
                          🌅 Mañana
                        </th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-orange-600 uppercase tracking-wide">
                          🌇 Tarde
                        </th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                          🌙 Descanso
                        </th>
                        <th className="text-center px-2 py-2 text-[10px] font-semibold text-purple-600 uppercase tracking-wide">
                          🍽 Colación
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {perDayMTD.map(({ day, manana, tarde, descanso, colaciones }, i) => (
                        <tr
                          key={`mtd-${day}`}
                          className={`border-b border-border/30 ${i % 2 === 0 ? '' : 'bg-muted/5'}`}
                        >
                          <td className="px-3 py-1.5 font-bold text-foreground text-[11px] border-r border-border/50">
                            {day}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {manana > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-amber-100 text-amber-700 font-bold text-[11px]">
                                {manana}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {tarde > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-orange-100 text-orange-700 font-bold text-[11px]">
                                {tarde}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {descanso > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[1.75rem] h-6 px-1.5 rounded-md bg-slate-200 text-slate-600 font-bold text-[11px]">
                                {descanso}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            {colaciones.length > 0 ? (
                              <span className="inline-flex items-center justify-center h-6 px-1.5 rounded-md bg-purple-100 text-purple-700 font-bold text-[11px]">
                                {colaciones.map((c) => `${c}m`).join(' / ')}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/30 text-[10px]">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

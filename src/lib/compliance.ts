import type { Shift, ShiftCode } from '@/context/AppContext';

// Reglas de la malla en UN solo lugar: las usan la Malla (colores, contadores, avisos)
// y la pantalla de Cumplimiento, para que nunca digan cosas distintas.

/** Máximo de días seguidos trabajados (el 7.º debe ser descanso) */
export const MAX_CONSECUTIVE_DAYS = 6;
/** Mínimo de domingos libres al mes (si el mes tiene al menos 2) */
export const MIN_SUNDAYS_OFF = 2;
/** Tolerancia para "menos horas de lo contratado" (aviso, no ley) */
const UNDER_TOLERANCE = 0.1;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Horas netas de un turno (descontando colación) */
export function shiftNetHours(shift: Shift | undefined): number {
  if (!shift || !shift.start || !shift.end) return 0;
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const colacion = shift.colacion && shift.colacion > 0 ? shift.colacion : 0;
  return Math.max(0, (mins - colacion) / 60);
}

/** Un día cuenta como trabajado si tiene turno y no es descanso ni día especial */
export function isWorkedDay(code: ShiftCode | undefined, special: string | undefined): boolean {
  return !!code && code !== 'DESC' && code !== 'NOT' && !special;
}

export interface WeekCompliance {
  /** Primer y último día (1-based) de la semana dentro del mes */
  startDay: number;
  endDay: number;
  /** Días del mes que caen en esta semana */
  daysInMonth: number;
  /** Horas y días trabajados dentro del mes */
  hours: number;
  scheduledDays: number;
  /** Horas de la misma semana en el mes anterior / siguiente (semanas que cruzan meses) */
  prevHours: number;
  nextHours: number;
  /** Horas de la semana completa (lunes a domingo) */
  totalHours: number;
  isBoundary: boolean;
  /** Supera las horas contratadas por semana */
  over: boolean;
  /** Menos horas de lo esperado (aviso) */
  under: boolean;
}

export interface MonthCompliance {
  hasShifts: boolean;
  totalHours: number;
  weeks: WeekCompliance[];
  maxConsecutive: number;
  /** Primer y último día (1-based) de la racha más larga; 0 o menos = empezó el mes anterior */
  maxRunStartDay: number;
  maxRunEndDay: number;
  consecutiveOk: boolean;
  totalSundays: number;
  sundaysOff: number;
  /** Días (1-based) de los domingos trabajados */
  sundaysWorkedDays: number[];
  /** false si la persona trabaja todos los domingos o el mes tiene menos de 2 */
  sundayRuleApplies: boolean;
  sundaysOk: boolean;
  hoursOk: boolean;
  /** Incumplimientos (para el color de la fila y el detalle) */
  alerts: string[];
}

export interface MonthInput {
  year: number;
  /** 0 = enero */
  monthIdx: number;
  sched: ShiftCode[];
  special: Record<number, string>;
  prevSched?: ShiftCode[];
  prevSpecial?: Record<number, string>;
  nextSched?: ShiftCode[];
  nextSpecial?: Record<number, string>;
  shifts: Record<string, Shift>;
  weeklyHours: number;
  /** Trabaja todos los domingos: no aplica la regla de domingos libres */
  exentoDomingos?: boolean;
}

export function evaluateMonth(input: MonthInput): MonthCompliance {
  const { year, monthIdx, sched, special, shifts, weeklyHours } = input;
  const prevSched = input.prevSched;
  const prevSpecial = input.prevSpecial ?? {};
  const nextSched = input.nextSched;
  const nextSpecial = input.nextSpecial ?? {};
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const prevDaysInMonth = new Date(year, monthIdx, 0).getDate();

  const worked = (i: number) => isWorkedDay(sched[i], special[i]);
  const hoursOf = (code: ShiftCode | undefined) => shiftNetHours(code ? shifts[code] : undefined);

  let hasShifts = false;
  let totalHours = 0;
  for (let i = 0; i < daysInMonth; i++) {
    if (!worked(i)) continue;
    hasShifts = true;
    totalHours += hoursOf(sched[i]);
  }

  // ── Semanas (lunes a domingo), recortadas al mes ──
  const weeks: WeekCompliance[] = [];
  let d = 1;
  while (d <= daysInMonth) {
    const dow = (new Date(year, monthIdx, d).getDay() + 6) % 7; // 0 = lunes
    const monday = d - dow;
    const startDay = Math.max(1, monday);
    const endDay = Math.min(daysInMonth, monday + 6);

    let hours = 0;
    let scheduledDays = 0;
    for (let day = startDay; day <= endDay; day++) {
      if (!worked(day - 1)) continue;
      hours += hoursOf(sched[day - 1]);
      scheduledDays++;
    }

    // Parte de la semana que cae en el mes anterior / siguiente
    let prevHours = 0;
    const daysBefore = startDay - monday;
    if (daysBefore > 0 && prevSched) {
      for (let k = 0; k < daysBefore; k++) {
        const idx = prevDaysInMonth - daysBefore + k;
        if (isWorkedDay(prevSched[idx], prevSpecial[idx])) prevHours += hoursOf(prevSched[idx]);
      }
    }
    let nextHours = 0;
    const daysAfter = monday + 6 - endDay;
    if (daysAfter > 0 && nextSched) {
      for (let k = 0; k < daysAfter; k++) {
        if (isWorkedDay(nextSched[k], nextSpecial[k])) nextHours += hoursOf(nextSched[k]);
      }
    }

    const weekDays = endDay - startDay + 1;
    const isBoundary = weekDays < 7;
    const total = hours + prevHours + nextHours;
    const over = round1(total) > weeklyHours;

    let under = false;
    if (hours > 0 && scheduledDays > 0) {
      if (!isBoundary) {
        under = hours < weeklyHours * (scheduledDays / 7) * (1 - UNDER_TOLERANCE);
      } else {
        const adjacentKnown = daysBefore > 0 ? !!prevSched : !!nextSched;
        under = adjacentKnown
          ? total < weeklyHours * (1 - UNDER_TOLERANCE)
          : hours < weeklyHours * (weekDays / 7) * (1 - UNDER_TOLERANCE);
      }
    }

    weeks.push({
      startDay,
      endDay,
      daysInMonth: weekDays,
      hours: round1(hours),
      scheduledDays,
      prevHours: round1(prevHours),
      nextHours: round1(nextHours),
      totalHours: round1(total),
      isBoundary,
      over,
      under,
    });
    d = endDay + 1;
  }

  // ── Días seguidos (incluye los últimos días del mes anterior) ──
  let run = 0;
  if (prevSched) {
    for (let idx = prevDaysInMonth - 1; idx >= 0; idx--) {
      if (!isWorkedDay(prevSched[idx], prevSpecial[idx])) break;
      run++;
    }
  }
  // La racha del mes anterior solo cuenta si continúa el día 1 de este mes
  let maxConsecutive = 0;
  let maxRunStartDay = 0;
  let maxRunEndDay = 0;
  for (let i = 0; i < daysInMonth; i++) {
    if (worked(i)) {
      run++;
      if (run > maxConsecutive) {
        maxConsecutive = run;
        maxRunEndDay = i + 1;
        maxRunStartDay = i + 2 - run;
      }
    } else {
      run = 0;
    }
  }
  const consecutiveOk = maxConsecutive <= MAX_CONSECUTIVE_DAYS;

  // ── Domingos libres ──
  let totalSundays = 0;
  let sundaysOff = 0;
  const sundaysWorkedDays: number[] = [];
  for (let i = 0; i < daysInMonth; i++) {
    if (new Date(year, monthIdx, i + 1).getDay() !== 0) continue;
    totalSundays++;
    if (!worked(i)) sundaysOff++;
    else sundaysWorkedDays.push(i + 1);
  }
  const sundayRuleApplies = !input.exentoDomingos && totalSundays >= MIN_SUNDAYS_OFF;
  const sundaysOk = !hasShifts || !sundayRuleApplies || sundaysOff >= MIN_SUNDAYS_OFF;

  const overWeeks = weeks.filter((w) => w.over);
  const hoursOk = overWeeks.length === 0;

  const alerts: string[] = [];
  if (hasShifts) {
    if (!consecutiveOk)
      alerts.push(`${maxConsecutive} días seguidos trabajados (máx. ${MAX_CONSECUTIVE_DAYS})`);
    if (!sundaysOk)
      alerts.push(`Solo ${sundaysOff} domingo(s) libre(s) en el mes (mínimo ${MIN_SUNDAYS_OFF})`);
    overWeeks.forEach((w) =>
      alerts.push(
        `Semana del ${w.startDay} al ${w.endDay}: ${w.totalHours}h (límite ${weeklyHours}h/semana)`
      )
    );
  }

  return {
    hasShifts,
    totalHours: round1(totalHours),
    weeks,
    maxConsecutive,
    maxRunStartDay,
    maxRunEndDay,
    consecutiveOk: !hasShifts || consecutiveOk,
    totalSundays,
    sundaysOff,
    sundaysWorkedDays,
    sundayRuleApplies,
    sundaysOk,
    hoursOk: !hasShifts || hoursOk,
    alerts,
  };
}

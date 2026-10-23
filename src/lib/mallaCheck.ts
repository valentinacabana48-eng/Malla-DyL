import { timeToMinutes, type Worker } from '@/context/AppContext';
import type { PublishedMonth } from '@/lib/misTurnos';

// Revisión de la malla antes de publicarla: días sin turno asignado y horas en que no queda
// nadie de un cargo. Solo avisa; publicar igual sigue siendo posible.

export interface EmptyDays {
  name: string;
  days: number[];
}

export interface CoverageGap {
  day: number;
  cargo: string;
  /** Tramos sin nadie, en horas enteras: [desde, hasta) */
  ranges: [number, number][];
}

export interface MallaCheck {
  emptyDays: EmptyDays[];
  gaps: CoverageGap[];
}

/** Cargos con menos personas que esto no se revisan por hora (con 1 o 2 es normal quedar sin nadie). */
const MIN_PER_CARGO = 3;

function span(d: PublishedMonth[number]): [number, number] | null {
  if (!d || d.esp || !d.s || !d.e) return null;
  const start = timeToMinutes(d.s);
  let end = timeToMinutes(d.e);
  if (end <= start) end += 1440;
  return [start, end];
}

export function checkMalla(
  workers: Worker[],
  current: Record<string, PublishedMonth>,
  daysInMonth: number,
  /** Días ocultos por trabajadora ([desde, hasta], desde 1): no cuentan como vacíos */
  ocultos: Record<string, [number, number]> = {}
): MallaCheck {
  const emptyDays: EmptyDays[] = [];
  workers.forEach((w) => {
    const days: number[] = [];
    const o = ocultos[w.id];
    for (let i = 0; i < daysInMonth; i++)
      if (!current[w.id]?.[i] && !(o && i + 1 >= o[0] && i + 1 <= o[1])) days.push(i);
    if (days.length) emptyDays.push({ name: w.name, days });
  });

  // Días en que no trabaja nadie de la sucursal (local cerrado): no se revisan por hora
  const open: boolean[] = [];
  for (let i = 0; i < daysInMonth; i++)
    open.push(workers.some((w) => span(current[w.id]?.[i]) !== null));

  const byCargo = new Map<string, Worker[]>();
  workers.forEach((w) => {
    const c = w.cargo || 'Sin cargo';
    byCargo.set(c, [...(byCargo.get(c) ?? []), w]);
  });

  const gaps: CoverageGap[] = [];
  byCargo.forEach((list, cargo) => {
    if (list.length < MIN_PER_CARGO) return;
    // count[día][hora]: cuántas del cargo están a esa hora
    const count: number[][] = [];
    for (let i = 0; i < daysInMonth; i++) {
      const row = new Array(24).fill(0);
      list.forEach((w) => {
        const t = span(current[w.id]?.[i]);
        if (!t) return;
        for (let h = 0; h < 24; h++) {
          const at = h * 60;
          if ((t[0] <= at && t[1] > at) || (t[0] <= at + 1440 && t[1] > at + 1440)) row[h]++;
        }
      });
      count.push(row);
    }
    // Horario de atención del cargo: las horas cubiertas en al menos la mitad de los días abiertos
    const openDays = open.filter(Boolean).length;
    if (!openDays) return;
    const usual = Array.from(
      { length: 24 },
      (_, h) => count.filter((row, i) => open[i] && row[h] > 0).length * 2 >= openDays
    );
    for (let i = 0; i < daysInMonth; i++) {
      if (!open[i]) continue;
      const ranges: [number, number][] = [];
      for (let h = 0; h < 24; h++) {
        if (!usual[h] || count[i][h] > 0) continue;
        const last = ranges[ranges.length - 1];
        if (last && last[1] === h) last[1] = h + 1;
        else ranges.push([h, h + 1]);
      }
      if (ranges.length) gaps.push({ day: i, cargo, ranges });
    }
  });
  gaps.sort((a, b) => a.day - b.day || a.cargo.localeCompare(b.cargo, 'es'));
  return { emptyDays, gaps };
}

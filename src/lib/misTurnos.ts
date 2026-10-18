import {
  NON_WORKING_TYPES,
  type NonWorkingType,
  type Shift,
  type ShiftCode,
} from '@/context/AppContext';

/**
 * Un día de la malla publicada (lo que ve la trabajadora en Mis turnos).
 * Misma forma que arma public.effective_month_days() en la base de datos.
 */
export interface PublishedDay {
  /** Código del turno o del día especial */
  c: string;
  /** Nombre (del turno, o del día especial propio de la empresa) */
  l?: string;
  /** Entrada y salida */
  s?: string;
  e?: string;
  /** Minutos de colación */
  col?: number;
  /** Día especial (vacaciones, licencia, descanso, ...) */
  esp?: boolean;
}

export type PublishedMonth = (PublishedDay | null)[];

/** Calcula en la app la malla del mes como quedaría al publicarla (para ver cambios sin publicar). */
export function effectiveMonthDays(
  sched: ShiftCode[] | undefined,
  special: Record<number, string> | undefined,
  shifts: Record<string, Shift>,
  daysInMonth: number
): PublishedMonth {
  const out: PublishedMonth = [];
  for (let i = 0; i < daysInMonth; i++) {
    const sp = special?.[i];
    if (sp) {
      out.push({ c: sp, esp: true });
      continue;
    }
    const code = sched?.[i];
    if (!code) {
      out.push(null);
      continue;
    }
    const sh = shifts[code];
    const d: PublishedDay = { c: code };
    if (sh?.start) d.s = sh.start;
    if (sh?.end) d.e = sh.end;
    if (sh?.colacion) d.col = sh.colacion;
    out.push(d);
  }
  return out;
}

/** Igual a como compara la base de datos: código y horario (el nombre no cuenta). */
export function sameDay(a: PublishedDay | null | undefined, b: PublishedDay | null | undefined) {
  if (!a || !b) return !a && !b;
  return (
    a.c === b.c &&
    (a.s ?? '') === (b.s ?? '') &&
    (a.e ?? '') === (b.e ?? '') &&
    (a.col ?? 0) === (b.col ?? 0) &&
    !!a.esp === !!b.esp
  );
}

/** Días que cambiaron entre dos versiones */
export function changedDays(a: PublishedMonth, b: PublishedMonth): number[] {
  const n = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (!sameDay(a[i], b[i])) out.push(i);
  return out;
}

const SHORT: Record<string, string> = {
  DESCANSO: 'DESC',
  DESC: 'DESC',
  NT: 'NT',
  FERIADO: 'FER',
  LICENCIA: 'LIC',
  CUMPLEANOS: 'CUMPLE',
  PERMISO_CG: 'PERM',
  PERMISO_SG: 'PERM',
  PERMISO: 'PERM',
  VACACIONES: 'VAC',
};

function specialLabel(d: PublishedDay, extra: NonWorkingType[] = []): string {
  return (
    d.l ||
    NON_WORKING_TYPES.find((t) => t.code === d.c)?.label ||
    extra.find((t) => t.code === d.c)?.label ||
    d.c
  );
}

/** Texto largo de un día: "09:00 a 16:00", "Vacaciones", "Descanso" */
export function dayText(d: PublishedDay | null | undefined, extra: NonWorkingType[] = []): string {
  if (!d) return 'Sin turno';
  if (d.esp) return specialLabel(d, extra);
  if (d.s && d.e) return `${d.s} a ${d.e}`;
  return d.l || (d.c === 'DESC' ? 'Descanso' : d.c);
}

/** Texto corto para la celda del calendario */
export function dayShort(d: PublishedDay | null | undefined): string {
  if (!d) return '';
  if (!d.esp && d.s && d.e) return `${d.s}\n${d.e}`;
  return SHORT[d.c] ?? (d.l || d.c).slice(0, 6).toUpperCase();
}

/** Tipo de día, para el color de la celda */
export function dayKind(
  d: PublishedDay | null | undefined
): 'vacio' | 'turno' | 'descanso' | 'especial' {
  if (!d) return 'vacio';
  if (d.c === 'DESC' || d.c === 'DESCANSO' || d.c === 'NT') return 'descanso';
  if (d.esp) return 'especial';
  return d.s ? 'turno' : 'descanso';
}

export const MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/** "2026-10" → "Octubre 2026" */
export function monthKeyToLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[(m || 1) - 1]} ${y}`;
}

/** Mensaje de WhatsApp sin número: abre WhatsApp para elegir el chat o grupo */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function misTurnosUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/mis-turnos`;
}

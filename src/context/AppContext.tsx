'use client';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { useAuth } from '@/context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShiftCode = string | null;

export interface Shift {
  code: string;
  label: string;
  start: string;
  end: string;
  colorClass: string;
  legendColor: string;
  colacion: number;
  /** Sucursal dueña del turno; null/undefined = turno compartido por todas */
  sucursal?: string | null;
}

/** Turnos que se pueden asignar en esas sucursales: los compartidos y los propios de cada una */
export function shiftsForSucursales(
  shifts: Record<string, Shift>,
  sucursales: string[]
): Record<string, Shift> {
  return Object.fromEntries(
    Object.entries(shifts).filter(([, s]) => !s.sucursal || sucursales.includes(s.sucursal))
  );
}

// ─── Non-working day types ─────────────────────────────────────────────────────

export interface NonWorkingType {
  code: string;
  label: string;
  colorClass: string;
  legendColor: string;
  maxDaysPerMonth: number | null;
  icon: string;
  /** Tipo antiguo: se sigue mostrando donde ya existe, pero no se ofrece para asignar */
  legacy?: boolean;
}

export const NON_WORKING_TYPES: NonWorkingType[] = [
  {
    code: 'DESCANSO',
    label: 'Descanso',
    colorClass: 'bg-slate-100 text-slate-700 border border-slate-300',
    legendColor: 'bg-slate-400',
    maxDaysPerMonth: null,
    icon: '😴',
  },
  {
    code: 'NT',
    label: 'No trabajaba',
    colorClass: 'bg-gray-100 text-gray-500 border border-gray-300',
    legendColor: 'bg-gray-400',
    maxDaysPerMonth: null,
    icon: '🚫',
  },
  {
    code: 'FERIADO',
    label: 'Feriado',
    colorClass: 'bg-red-100 text-red-700 border border-red-300',
    legendColor: 'bg-red-500',
    maxDaysPerMonth: null,
    icon: '🇨🇱',
  },
  {
    code: 'LICENCIA',
    label: 'Licencia',
    colorClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    legendColor: 'bg-yellow-500',
    maxDaysPerMonth: null,
    icon: '🏥',
  },
  {
    code: 'CUMPLEANOS',
    label: 'Cumpleaños',
    colorClass: 'bg-pink-100 text-pink-700 border border-pink-300',
    legendColor: 'bg-pink-400',
    maxDaysPerMonth: 1,
    icon: '🎂',
  },
  {
    code: 'PERMISO_CG',
    label: 'Permiso con goce',
    colorClass: 'bg-teal-100 text-teal-800 border border-teal-300',
    legendColor: 'bg-teal-500',
    maxDaysPerMonth: 3,
    icon: '📋',
  },
  {
    code: 'PERMISO_SG',
    label: 'Permiso sin goce',
    colorClass: 'bg-orange-100 text-orange-800 border border-orange-300',
    legendColor: 'bg-orange-500',
    maxDaysPerMonth: 3,
    icon: '📝',
  },
  {
    // Días cargados antes de separar con/sin goce
    code: 'PERMISO',
    label: 'Permiso',
    colorClass: 'bg-teal-100 text-teal-800 border border-teal-300',
    legendColor: 'bg-teal-500',
    maxDaysPerMonth: 3,
    icon: '📋',
    legacy: true,
  },
  {
    code: 'VACACIONES',
    label: 'Vacaciones',
    colorClass: 'bg-green-100 text-green-800 border border-green-300',
    legendColor: 'bg-green-500',
    maxDaysPerMonth: null,
    icon: '🌴',
  },
];

export const NON_WORKING_COLOR_OPTIONS = [
  {
    label: 'Gris',
    colorClass: 'bg-slate-100 text-slate-700 border border-slate-300',
    legendColor: 'bg-slate-400',
  },
  {
    label: 'Amarillo',
    colorClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    legendColor: 'bg-yellow-500',
  },
  {
    label: 'Rosado',
    colorClass: 'bg-pink-100 text-pink-700 border border-pink-300',
    legendColor: 'bg-pink-400',
  },
  {
    label: 'Teal',
    colorClass: 'bg-teal-100 text-teal-800 border border-teal-300',
    legendColor: 'bg-teal-500',
  },
  {
    label: 'Verde',
    colorClass: 'bg-green-100 text-green-800 border border-green-300',
    legendColor: 'bg-green-500',
  },
  {
    label: 'Azul',
    colorClass: 'bg-blue-100 text-blue-800 border border-blue-300',
    legendColor: 'bg-blue-500',
  },
  {
    label: 'Morado',
    colorClass: 'bg-purple-100 text-purple-800 border border-purple-300',
    legendColor: 'bg-purple-500',
  },
  {
    label: 'Naranja',
    colorClass: 'bg-orange-100 text-orange-800 border border-orange-300',
    legendColor: 'bg-orange-400',
  },
  {
    label: 'Rojo',
    colorClass: 'bg-red-100 text-red-800 border border-red-300',
    legendColor: 'bg-red-500',
  },
  {
    label: 'Celeste',
    colorClass: 'bg-cyan-100 text-cyan-800 border border-cyan-300',
    legendColor: 'bg-cyan-500',
  },
  {
    label: 'Índigo',
    colorClass: 'bg-indigo-100 text-indigo-800 border border-indigo-300',
    legendColor: 'bg-indigo-500',
  },
  {
    label: 'Lima',
    colorClass: 'bg-lime-100 text-lime-800 border border-lime-300',
    legendColor: 'bg-lime-500',
  },
];

export type SpecialDaysMonth = Record<string, Record<number, string>>;
export type SpecialDaysData = Record<string, SpecialDaysMonth>;

export interface Worker {
  id: string;
  name: string;
  initials: string;
  rut: string;
  cargo: string;
  role: string;
  sucursal: string;
  area: string;
  horasContratadas: number;
  estado: 'Activo' | 'Inactivo';
  avatarColor: string;
  birthday: string;
  /** Trabaja todos los domingos (p. ej. contratos de fin de semana): sin alerta de domingos libres */
  exentoDomingos?: boolean;
}

export type MonthSchedule = Record<string, ShiftCode[]>;
export type ScheduleData = Record<string, MonthSchedule>;
export type AreaCargos = Record<string, string[]>;

export const HORAS_OPTIONS = [10, 20, 30, 42];

export type TipoAusencia = 'LICENCIA' | 'PERMISO_CG' | 'PERMISO_SG' | 'VACACIONES';

/** Licencia, permiso o vacaciones registrados desde la Malla (desde `desde`, `dias` días) */
export interface Licencia {
  id: string;
  workerId: string;
  tipo: TipoAusencia;
  /** Motivo u observación (sale en la hoja de permiso) */
  motivo: string;
  /** Cuándo se registró, "YYYY-MM-DD" */
  creada: string;
  /** Primer día, "YYYY-MM-DD" */
  desde: string;
  dias: number;
  /** Último día de licencia; vuelve el día siguiente */
  hasta: string;
  /** Turno que tenía programado cada día: { "2026-10-22": "M1" } */
  turnos: Record<string, string>;
  /** Día especial que había antes (descanso, etc.), para devolverlo si se quita */
  especiales: Record<string, string>;
  avisoResuelto: boolean;
}

/** "2026-10-22" + n días → "YYYY-MM-DD" (fechas locales, sin problemas de zona horaria) */
export function addDaysISO(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function rowToLicencia(r: Record<string, unknown>): Licencia {
  return {
    id: r.id as string,
    workerId: r.worker_id as string,
    tipo: ((r.tipo as string) || 'LICENCIA') as TipoAusencia,
    motivo: (r.motivo as string) || '',
    creada: ((r.created_at as string) || '').slice(0, 10),
    desde: r.desde as string,
    dias: r.dias as number,
    hasta: (r.hasta as string) || addDaysISO(r.desde as string, (r.dias as number) - 1),
    turnos: (r.turnos as Record<string, string>) || {},
    especiales: (r.especiales as Record<string, string>) || {},
    avisoResuelto: r.aviso_resuelto === true,
  };
}

export interface Sucursal {
  name: string;
  cajas: number;
}

const DEFAULT_SUCURSALES_DATA: Sucursal[] = [
  { name: 'Mayorista Talca', cajas: 20 },
  { name: 'Mayorista Curicó', cajas: 20 },
  { name: 'Mayorista Linares', cajas: 20 },
  { name: 'Mayorista Rancagua', cajas: 20 },
];
const DEFAULT_AREAS = ['Cajas', 'Tesorería', 'Supermercado', 'Bodega'];

const MONTH_NAMES_LIST = [
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
export const MESES: string[] = [];
for (let year = 2026; year <= 2030; year++) {
  for (const m of MONTH_NAMES_LIST) {
    MESES.push(`${m} ${year}`);
  }
}

export const DAYS_OF_WEEK_AUG_2026 = [
  'S',
  'D',
  'L',
  'M',
  'M',
  'J',
  'V',
  'S',
  'D',
  'L',
  'M',
  'M',
  'J',
  'V',
  'S',
  'D',
  'L',
  'M',
  'M',
  'J',
  'V',
  'S',
  'D',
  'L',
  'M',
  'M',
  'J',
  'V',
  'S',
  'D',
  'L',
];

export function monthLabelToKey(monthLabel: string): string {
  const MONTH_NAMES: Record<string, number> = {
    Enero: 1,
    Febrero: 2,
    Marzo: 3,
    Abril: 4,
    Mayo: 5,
    Junio: 6,
    Julio: 7,
    Agosto: 8,
    Septiembre: 9,
    Octubre: 10,
    Noviembre: 11,
    Diciembre: 12,
  };
  const parts = monthLabel.split(' ');
  const monthNum = MONTH_NAMES[parts[0]] ?? 1;
  const year = parseInt(parts[1] || '2026', 10);
  return `${year}-${String(monthNum).padStart(2, '0')}`;
}

export function getDaysOfWeekForMonth(monthLabel: string): string[] {
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
  const monthIdx = MONTH_NAMES[parts[0]] ?? 7;
  const year = parseInt(parts[1] || '2026', 10);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const DOW_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const result: string[] = [];
  for (let d = 1; d <= 31; d++) {
    if (d <= daysInMonth) {
      const date = new Date(year, monthIdx, d);
      result.push(DOW_LETTERS[date.getDay()]);
    } else {
      result.push('');
    }
  }
  return result;
}

export function getDaysInMonth(monthLabel: string): number {
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
  const monthIdx = MONTH_NAMES[parts[0]] ?? 7;
  const year = parseInt(parts[1] || '2026', 10);
  return new Date(year, monthIdx + 1, 0).getDate();
}

/** Hora "6:00" o "06:00" en minutos, para ordenar turnos (sin hora = al final) */
export function timeToMinutes(t: string | undefined | null): number {
  const m = /^(\d{1,2}):(\d{2})/.exec((t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number.POSITIVE_INFINITY;
}

export function calcNetHours(shift: Shift): number {
  if (!shift.start || !shift.end) return 0;
  const [sh, sm] = shift.start.split(':').map(Number);
  const [eh, em] = shift.end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  const grossHours = mins / 60;
  if (grossHours > 5 && shift.colacion > 0) {
    return Math.round((grossHours - shift.colacion / 60) * 100) / 100;
  }
  return Math.round(grossHours * 100) / 100;
}

export const SHIFT_COLOR_OPTIONS = [
  {
    label: 'Azul',
    colorClass: 'bg-blue-100 text-blue-800 border border-blue-300',
    legendColor: 'bg-blue-500',
  },
  {
    label: 'Verde',
    colorClass: 'bg-green-100 text-green-800 border border-green-300',
    legendColor: 'bg-green-600',
  },
  {
    label: 'Naranja',
    colorClass: 'bg-orange-100 text-orange-800 border border-orange-300',
    legendColor: 'bg-orange-400',
  },
  {
    label: 'Morado',
    colorClass: 'bg-purple-100 text-purple-800 border border-purple-300',
    legendColor: 'bg-purple-500',
  },
  {
    label: 'Rojo',
    colorClass: 'bg-red-100 text-red-800 border border-red-300',
    legendColor: 'bg-red-500',
  },
  {
    label: 'Rosado',
    colorClass: 'bg-pink-100 text-pink-800 border border-pink-300',
    legendColor: 'bg-pink-500',
  },
  {
    label: 'Celeste',
    colorClass: 'bg-cyan-100 text-cyan-800 border border-cyan-300',
    legendColor: 'bg-cyan-500',
  },
  {
    label: 'Amarillo',
    colorClass: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    legendColor: 'bg-yellow-500',
  },
  {
    label: 'Gris',
    colorClass: 'bg-slate-100 text-slate-700 border border-slate-300',
    legendColor: 'bg-slate-400',
  },
  {
    label: 'Teal',
    colorClass: 'bg-teal-100 text-teal-800 border border-teal-300',
    legendColor: 'bg-teal-500',
  },
];

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  workers: Worker[];
  shifts: Record<string, Shift>;
  scheduleData: ScheduleData;
  specialDays: SpecialDaysData;
  /** Carga esos meses de la malla si todavía no están ("YYYY-MM") */
  ensureMonths: (monthKeys: string[]) => Promise<void>;
  /** Carga esos meses y devuelve la malla al día (para exportar meses que no se ven) */
  loadMonths: (
    monthKeys: string[]
  ) => Promise<{ scheduleData: ScheduleData; specialDays: SpecialDaysData }>;
  /** Si la malla de ese mes ya está completa */
  isMonthLoaded: (monthKey: string) => boolean;
  sucursales: Sucursal[];
  areas: string[];
  areaCargos: AreaCargos;
  selectedMes: string;
  globalSucursal: string;
  setGlobalSucursal: (s: string) => void;
  globalArea: string;
  setGlobalArea: (a: string) => void;
  customNonWorkingTypes: NonWorkingType[];
  loading: boolean;
  setSelectedMes: (mes: string) => void;
  addWorker: (w: Worker) => void;
  updateWorker: (w: Worker) => void;
  deleteWorker: (id: string) => void;
  addShift: (s: Shift) => void;
  updateShift: (s: Shift) => void;
  deleteShift: (code: string) => void;
  setCellShift: (
    workerId: string,
    dayIndex: number,
    shift: ShiftCode,
    overrideMonthKey?: string
  ) => Promise<boolean>;
  bulkAssign: (workerIds: string[], dayIndices: number[], shift: ShiftCode) => Promise<boolean>;
  getScheduleForWorker: (workerId: string) => ShiftCode[];
  setSpecialDay: (
    workerId: string,
    dayIndex: number,
    typeCode: string | null,
    overrideMonthKey?: string
  ) => void;
  bulkAssignSpecialDay: (
    workerIds: string[],
    dayIndices: number[],
    typeCode: string | null
  ) => void;
  getSpecialDaysForWorker: (workerId: string) => Record<number, string>;
  addSucursal: (name: string, cajas?: number) => void;
  updateSucursal: (oldName: string, newName: string, cajas?: number) => void;
  deleteSucursal: (name: string) => void;
  getSucursalCajas: (name: string) => number;
  addArea: (name: string) => void;
  updateArea: (oldName: string, newName: string) => void;
  deleteArea: (name: string) => void;
  setAreaCargos: (area: string, cargos: string[]) => void;
  addCustomNonWorkingType: (t: NonWorkingType) => void;
  updateCustomNonWorkingType: (t: NonWorkingType) => void;
  deleteCustomNonWorkingType: (code: string) => void;
  getAllNonWorkingTypes: () => NonWorkingType[];
  licencias: Licencia[];
  /**
   * Pone LICENCIA desde `desde` por `dias` días corridos y guarda los turnos que tenía.
   * Un permiso o vacaciones solo marca los días en que tenía turno.
   */
  registrarLicencia: (
    workerId: string,
    desde: string,
    dias: number,
    tipo?: TipoAusencia,
    motivo?: string
  ) => Promise<boolean>;
  /** Quita la licencia y devuelve los turnos que tenía */
  quitarLicencia: (id: string) => Promise<boolean>;
  resolverAvisoLicencia: (id: string) => Promise<void>;
  /** Turno que tenía programado un día de licencia (o undefined) */
  getLicenciaTurno: (workerId: string, dateStr: string) => string | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── DB row → app type helpers ────────────────────────────────────────────────

function rowToWorker(row: Record<string, unknown>): Worker {
  return {
    id: row.id as string,
    name: row.name as string,
    initials: row.initials as string,
    rut: (row.rut as string) || '',
    cargo: (row.cargo as string) || '',
    role: (row.role as string) || '',
    sucursal: (row.sucursal as string) || '',
    area: (row.area as string) || '',
    horasContratadas: (row.horas_contratadas as number) || 42,
    estado: (row.estado as 'Activo' | 'Inactivo') || 'Activo',
    avatarColor: (row.avatar_color as string) || '',
    birthday: (row.birthday as string) || '',
    exentoDomingos: row.exento_domingos === true,
  };
}

function workerToRow(w: Worker) {
  return {
    id: w.id,
    name: w.name,
    initials: w.initials,
    rut: w.rut,
    cargo: w.cargo,
    role: w.role,
    sucursal: w.sucursal,
    area: w.area,
    horas_contratadas: w.horasContratadas,
    estado: w.estado,
    avatar_color: w.avatarColor,
    birthday: w.birthday,
    exento_domingos: !!w.exentoDomingos,
  };
}

function rowToShift(row: Record<string, unknown>): Shift {
  return {
    code: row.code as string,
    label: row.label as string,
    start: (row.start_time as string) || '',
    end: (row.end_time as string) || '',
    colorClass: (row.color_class as string) || '',
    legendColor: (row.legend_color as string) || '',
    colacion: (row.colacion as number) || 0,
    sucursal: (row.sucursal as string | null) ?? null,
  };
}

function shiftToRow(s: Shift) {
  return {
    code: s.code,
    label: s.label,
    start_time: s.start,
    end_time: s.end,
    color_class: s.colorClass,
    legend_color: s.legendColor,
    colacion: s.colacion,
    sucursal: s.sucursal ?? null,
  };
}

function rowToNWT(row: Record<string, unknown>): NonWorkingType {
  return {
    code: row.code as string,
    label: row.label as string,
    colorClass: (row.color_class as string) || '',
    legendColor: (row.legend_color as string) || '',
    maxDaysPerMonth: row.max_days_per_month != null ? (row.max_days_per_month as number) : null,
    icon: (row.icon as string) || '',
  };
}

function nwtToRow(t: NonWorkingType) {
  return {
    code: t.code,
    label: t.label,
    color_class: t.colorClass,
    legend_color: t.legendColor,
    max_days_per_month: t.maxDaysPerMonth,
    icon: t.icon,
  };
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

type DbResult = { error: { message: string } | null };

/** Muestra un aviso si la escritura falla, para que nunca se pierdan cambios en silencio. */
async function dbWrite(op: PromiseLike<DbResult>, what: string): Promise<boolean> {
  try {
    const { error } = await op;
    if (error) {
      console.error(`Error al guardar ${what}:`, error);
      toast.error(`No se pudo guardar ${what}. Revisa tu conexión e intenta de nuevo.`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Error al guardar ${what}:`, err);
    toast.error(`No se pudo guardar ${what}. Revisa tu conexión e intenta de nuevo.`);
    return false;
  }
}

/** "2026-10" desplazado n meses → "2027-01" */
function shiftMonthKey(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Meses que se cargan al abrir: desde 3 meses antes hasta 3 después del actual */
function initialMonthKeys(): string[] {
  const now = new Date();
  const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return Array.from({ length: 7 }, (_, i) => shiftMonthKey(cur, i - 3));
}

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

/** Filas de la malla y de los días especiales de esos meses */
async function fetchMonths(monthKeys: string[]) {
  const supabase = getSupabase();
  const [scheduleRows, specialRows] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from('schedule_data')
        .select('*')
        .in('month_key', monthKeys)
        .order('id')
        .range(from, to)
    ),
    fetchAll((from, to) =>
      supabase
        .from('special_days_v2')
        .select('*')
        .in('month_key', monthKeys)
        .order('id')
        .range(from, to)
    ),
  ]);
  const sd: ScheduleData = {};
  const spd: SpecialDaysData = {};
  monthKeys.forEach((mk) => {
    sd[mk] = {};
    spd[mk] = {};
  });
  scheduleRows.forEach((r) => {
    sd[r.month_key as string][r.worker_id as string] =
      (r.days as ShiftCode[]) || Array(31).fill(null);
  });
  specialRows.forEach((r) => {
    const workerDays: Record<number, string> = {};
    Object.entries((r.days as Record<string, string>) || {}).forEach(([di, tc]) => {
      workerDays[Number(di)] = tc;
    });
    spd[r.month_key as string][r.worker_id as string] = workerDays;
  });
  return { sd, spd };
}

/**
 * Envuelve la malla (por mes) para que leer un mes no cargado lo pida. El pedido se hace
 * fuera del render para no actualizar estado mientras React dibuja.
 */
function lazyMonths<T extends object>(
  data: T,
  requested: React.MutableRefObject<Set<string>>,
  ensure: (keys: string[]) => Promise<void>
): T {
  return new Proxy(data, {
    get(target, prop, receiver) {
      if (typeof prop === 'string' && MONTH_KEY_RE.test(prop) && !requested.current.has(prop)) {
        queueMicrotask(() => ensure([prop]));
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

function fetchAllRows(table: string, orderBy: string): Promise<Record<string, unknown>[]> {
  return fetchAll((from, to) =>
    getSupabase().from(table).select('*').order(orderBy).range(from, to)
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

// El mes elegido es de cada dispositivo: si una persona cambia de mes no le cambia a las demás.
const SELECTED_MES_KEY = 'dyl_selected_mes';

function currentMonthLabel(): string {
  const now = new Date();
  const label = `${MONTH_NAMES_LIST[now.getMonth()]} ${now.getFullYear()}`;
  return MESES.includes(label) ? label : MESES[0];
}

function loadSelectedMes(): string {
  try {
    const saved = localStorage.getItem(SELECTED_MES_KEY);
    if (saved && MESES.includes(saved)) return saved;
  } catch {
    // localStorage no disponible (modo privado): se usa el mes actual
  }
  return currentMonthLabel();
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const { can, allowedSucursales, allowedAreas, allowedCargos } = useAuth();
  const canEditMalla = can('malla_editar');

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [sucursales, setSucursales] = useState<Sucursal[]>(DEFAULT_SUCURSALES_DATA);
  const [areas, setAreas] = useState<string[]>(DEFAULT_AREAS);
  const [areaCargos, setAreaCargosState] = useState<AreaCargos>({});
  const [selectedMes, setSelectedMesState] = useState<string>(() =>
    typeof window === 'undefined' ? currentMonthLabel() : loadSelectedMes()
  );
  const [globalSucursal, setGlobalSucursal] = useState<string>('Todas');
  const [globalArea, setGlobalArea] = useState<string>('Todas');
  const [scheduleData, setScheduleData] = useState<ScheduleData>({});
  const [specialDays, setSpecialDaysState] = useState<SpecialDaysData>({});
  const [customNonWorkingTypes, setCustomNonWorkingTypes] = useState<NonWorkingType[]>([]);
  const [licencias, setLicencias] = useState<Licencia[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Malla por meses: al abrir se cargan solo los meses cercanos y los demás cuando
  // alguna pantalla los pide. loadedMonths dice qué meses ya están completos. ──
  const [loadedMonths, setLoadedMonths] = useState<ReadonlySet<string>>(() => new Set());
  const requestedMonthsRef = useRef<Set<string>>(new Set());
  const loadedMonthsRef = useRef<Set<string>>(new Set());
  const ensureMonths = useCallback(async (monthKeys: string[]) => {
    const missing = monthKeys.filter(
      (mk) => MONTH_KEY_RE.test(mk) && !requestedMonthsRef.current.has(mk)
    );
    if (missing.length === 0) return;
    missing.forEach((mk) => requestedMonthsRef.current.add(mk));
    try {
      const { sd, spd } = await fetchMonths(missing);
      // Lo que llegó mientras tanto (cambios en vivo o recién guardados) es más nuevo.
      // Las referencias se actualizan al tiro para quien lea justo después de esperar.
      const nextSd = { ...scheduleDataRef.current };
      const nextSpd = { ...specialDaysRef.current };
      missing.forEach((mk) => {
        nextSd[mk] = { ...sd[mk], ...(nextSd[mk] || {}) };
        nextSpd[mk] = { ...spd[mk], ...(nextSpd[mk] || {}) };
      });
      scheduleDataRef.current = nextSd;
      specialDaysRef.current = nextSpd;
      setScheduleData((prev) => {
        const next = { ...prev };
        missing.forEach((mk) => (next[mk] = { ...sd[mk], ...(prev[mk] || {}) }));
        return next;
      });
      setSpecialDaysState((prev) => {
        const next = { ...prev };
        missing.forEach((mk) => (next[mk] = { ...spd[mk], ...(prev[mk] || {}) }));
        return next;
      });
      missing.forEach((mk) => loadedMonthsRef.current.add(mk));
      setLoadedMonths((prev) => new Set([...prev, ...missing]));
    } catch (err) {
      // Se puede volver a pedir
      missing.forEach((mk) => requestedMonthsRef.current.delete(mk));
      console.error('Error al cargar la malla de', missing.join(', '), err);
      toast.error('No se pudo cargar la malla de ese mes. Revisa tu conexión.');
    }
  }, []);
  const isMonthLoaded = useCallback(
    (monthKey: string) => loadedMonths.has(monthKey),
    [loadedMonths]
  );

  // Sucursales que esta persona puede ver (null = todas)
  const visibleSucursales = useMemo(
    () =>
      allowedSucursales ? sucursales.filter((s) => allowedSucursales.includes(s.name)) : sucursales,
    [sucursales, allowedSucursales]
  );

  // Áreas que esta persona puede ver (null = todas). Si solo ve algunos cargos, solo las
  // áreas que tienen esos cargos (p. ej. una jefa de caja que ve cajeras → Cajas).
  const visibleAreas = useMemo(() => {
    let list = allowedAreas ? areas.filter((a) => allowedAreas.includes(a)) : areas;
    if (allowedCargos) {
      const withCargo = list.filter((a) =>
        (areaCargos[a] || []).some((c) => allowedCargos.includes(c))
      );
      if (withCargo.length > 0) list = withCargo;
    }
    return list;
  }, [areas, allowedAreas, allowedCargos, areaCargos]);

  // ── Initial data load ──
  useEffect(() => {
    async function loadAll() {
      try {
        const [workersData, shiftsData, sucursalesData, areasData, areaCargosData, nwtData] =
          await Promise.all([
            fetchAllRows('workers', 'name'),
            fetchAllRows('shifts', 'label'),
            fetchAllRows('sucursales', 'name'),
            fetchAllRows('areas', 'name'),
            fetchAllRows('area_cargos', 'area_name'),
            fetchAllRows('custom_non_working_types', 'label'),
            // La malla: solo los meses cercanos al actual (los demás, cuando se piden)
            ensureMonths(initialMonthKeys()),
          ]);

        if (workersData)
          setWorkers(workersData.map((r) => rowToWorker(r as Record<string, unknown>)));
        if (shiftsData) {
          const shiftsMap: Record<string, Shift> = {};
          shiftsData.forEach((r) => {
            const s = rowToShift(r as Record<string, unknown>);
            shiftsMap[s.code] = s;
          });
          setShifts(shiftsMap);
        }
        if (sucursalesData && sucursalesData.length > 0) {
          setSucursales(
            sucursalesData.map((r) => ({ name: r.name as string, cajas: r.cajas as number }))
          );
        }
        if (areasData && areasData.length > 0) {
          setAreas(areasData.map((r) => r.name as string));
        }
        if (areaCargosData) {
          const ac: AreaCargos = {};
          areaCargosData.forEach((r) => {
            ac[r.area_name as string] = (r.cargos as string[]) || [];
          });
          setAreaCargosState(ac);
        }
        if (nwtData)
          setCustomNonWorkingTypes(nwtData.map((r) => rowToNWT(r as Record<string, unknown>)));
      } catch (err) {
        console.error('Error loading data from Supabase:', err);
        toast.error('No se pudieron cargar los datos. Recarga la página para intentar de nuevo.');
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [ensureMonths]);

  // El mes elegido y sus vecinos siempre cargados (las funciones de la Malla los usan)
  useEffect(() => {
    const key = monthLabelToKey(selectedMes);
    ensureMonths([-1, 0, 1].map((n) => shiftMonthKey(key, n)));
  }, [selectedMes, ensureMonths]);

  const loadMonths = useCallback(
    async (monthKeys: string[]) => {
      await ensureMonths(monthKeys);
      // Si otra pantalla ya lo estaba pidiendo, se espera a que termine
      for (let i = 0; i < 100 && monthKeys.some((mk) => !loadedMonthsRef.current.has(mk)); i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return { scheduleData: scheduleDataRef.current, specialDays: specialDaysRef.current };
    },
    [ensureMonths]
  );

  // Para las pantallas: leer un mes que todavía no está cargado lo pide a la base; mientras
  // llega se ve vacío y al llegar la pantalla se actualiza sola
  const scheduleDataView = useMemo(
    () => lazyMonths(scheduleData, requestedMonthsRef, ensureMonths),
    [scheduleData, ensureMonths]
  );
  const specialDaysView = useMemo(
    () => lazyMonths(specialDays, requestedMonthsRef, ensureMonths),
    [specialDays, ensureMonths]
  );

  // ── Licencias (aparte: si la tabla aún no existe, el resto de la app sigue funcionando) ──
  const reloadLicencias = useCallback(async () => {
    let data: Record<string, unknown>[];
    try {
      data = await fetchAll((from, to) =>
        supabase.from('licencias').select('*').order('desde').order('id').range(from, to)
      );
    } catch (error) {
      console.warn('Licencias no disponibles:', (error as Error).message);
      return;
    }
    setLicencias((data || []).map((r) => rowToLicencia(r as Record<string, unknown>)));
  }, [supabase]);

  useEffect(() => {
    reloadLicencias();
    const channel = supabase
      .channel('realtime-licencias')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'licencias' }, () => {
        reloadLicencias();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, reloadLicencias]);

  // ── Supabase real-time subscriptions ──────────────────────────────────────
  useEffect(() => {
    // Si cambian muchas trabajadoras o turnos seguidos (p. ej. al importar un Excel),
    // se espera a que terminen y se recarga la lista una sola vez.
    const RELOAD_DELAY_MS = 800;
    let workersTimer: ReturnType<typeof setTimeout> | undefined;
    let shiftsTimer: ReturnType<typeof setTimeout> | undefined;
    let workersReq = 0;
    let shiftsReq = 0;

    const reloadWorkers = async () => {
      const req = ++workersReq;
      try {
        const data = await fetchAllRows('workers', 'name');
        // Si mientras tanto se pidió otra recarga, esta respuesta ya quedó vieja
        if (req === workersReq) setWorkers(data.map(rowToWorker));
      } catch (err) {
        console.error('Error reloading workers:', err);
      }
    };

    const reloadShifts = async () => {
      const req = ++shiftsReq;
      const { data } = await supabase.from('shifts').select('*').order('label');
      if (data && req === shiftsReq) {
        const map: Record<string, Shift> = {};
        data.forEach((r) => {
          const s = rowToShift(r as Record<string, unknown>);
          map[s.code] = s;
        });
        setShifts(map);
      }
    };

    const channel = supabase
      .channel('realtime-app-data')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_data' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Record<string, unknown>;
            if (!old?.month_key || !old?.worker_id) return;
            setScheduleData((prev) => {
              const monthSched = { ...(prev[old.month_key as string] || {}) };
              delete monthSched[old.worker_id as string];
              return { ...prev, [old.month_key as string]: monthSched };
            });
            return;
          }
          const row = payload.new as Record<string, unknown>;
          if (!row || !row.month_key || !row.worker_id) return;
          const monthKey = row.month_key as string;
          const workerId = row.worker_id as string;
          const days = (row.days as ShiftCode[]) || Array(31).fill(null);
          setScheduleData((prev) => ({
            ...prev,
            [monthKey]: {
              ...(prev[monthKey] || {}),
              [workerId]: days,
            },
          }));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'special_days_v2' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as Record<string, unknown>;
            if (!old?.month_key || !old?.worker_id) return;
            const monthKey = old.month_key as string;
            const workerId = old.worker_id as string;
            setSpecialDaysState((prev) => {
              const monthData = { ...(prev[monthKey] || {}) };
              delete monthData[workerId];
              return { ...prev, [monthKey]: monthData };
            });
          } else {
            const row = payload.new as Record<string, unknown>;
            if (!row) return;
            const monthKey = row.month_key as string;
            const workerId = row.worker_id as string;
            const daysObj = (row.days as Record<string, string>) || {};
            const workerDays: Record<number, string> = {};
            Object.entries(daysObj).forEach(([di, tc]) => {
              workerDays[Number(di)] = tc;
            });
            setSpecialDaysState((prev) => {
              const monthData = { ...(prev[monthKey] || {}) };
              monthData[workerId] = workerDays;
              return { ...prev, [monthKey]: monthData };
            });
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workers' }, () => {
        clearTimeout(workersTimer);
        workersTimer = setTimeout(reloadWorkers, RELOAD_DELAY_MS);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        clearTimeout(shiftsTimer);
        shiftsTimer = setTimeout(reloadShifts, RELOAD_DELAY_MS);
      })
      .subscribe();

    return () => {
      clearTimeout(workersTimer);
      clearTimeout(shiftsTimer);
      supabase.removeChannel(channel);
    };
  }, [supabase]);
  // ─────────────────────────────────────────────────────────────────────────

  // ── setSelectedMes ──
  const setSelectedMes = useCallback(
    async (mes: string) => {
      const prevMonthKey = monthLabelToKey(selectedMes);
      const newMonthKey = monthLabelToKey(mes);
      setSelectedMesState(mes);
      try {
        localStorage.setItem(SELECTED_MES_KEY, mes);
      } catch {
        // localStorage no disponible: el mes solo dura esta sesión
      }

      // Arrastre: el turno del último día del mes anterior pasa al día 1 del mes nuevo,
      // solo si ese día está vacío. Lo hace la BD de forma atómica y solo para los
      // trabajadores que esta persona puede editar, así no pisa a nadie.
      if (!canEditMalla || prevMonthKey === newMonthKey) return;
      const [prevYear, prevMonth] = prevMonthKey.split('-').map(Number);
      // Solo al avanzar al mes siguiente. Si se salta de mes (octubre → diciembre) o se
      // retrocede, el "último día del mes anterior" sería de otro mes y se copiaría mal.
      const nextOfPrev = new Date(prevYear, prevMonth, 1);
      const expectedNewKey = `${nextOfPrev.getFullYear()}-${String(nextOfPrev.getMonth() + 1).padStart(2, '0')}`;
      if (newMonthKey !== expectedNewKey) return;
      const lastDayIdx = new Date(prevYear, prevMonth, 0).getDate() - 1;
      const { data, error } = await supabase.rpc('carry_over_month', {
        p_prev_month: prevMonthKey,
        p_new_month: newMonthKey,
        p_last_day_index: lastDayIdx,
      });
      if (error) {
        console.error('carry_over_month error:', error);
        return;
      }
      const rows = (data as { r_worker_id: string; r_days: ShiftCode[] }[] | null) || [];
      if (rows.length === 0) return;
      setScheduleData((prev) => {
        const monthSched = { ...(prev[newMonthKey] || {}) };
        rows.forEach((r) => {
          monthSched[r.r_worker_id] = r.r_days;
        });
        return { ...prev, [newMonthKey]: monthSched };
      });
    },
    [selectedMes, supabase, canEditMalla]
  );

  // ── Workers ──
  const addWorker = useCallback(
    async (w: Worker) => {
      setWorkers((prev) => [...prev, w]);
      const ok = await dbWrite(
        supabase.from('workers').upsert(workerToRow(w), { onConflict: 'id' }),
        'el trabajador'
      );
      if (!ok) setWorkers((prev) => prev.filter((x) => x.id !== w.id));
    },
    [supabase]
  );

  const updateWorker = useCallback(
    async (updated: Worker) => {
      setWorkers((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
      await dbWrite(
        supabase.from('workers').upsert(workerToRow(updated), { onConflict: 'id' }),
        'los cambios del trabajador'
      );
    },
    [supabase]
  );

  const deleteWorker = useCallback(
    async (id: string) => {
      setWorkers((prev) => prev.filter((w) => w.id !== id));
      setScheduleData((prev) => {
        const next: ScheduleData = {};
        Object.entries(prev).forEach(([mk, ms]) => {
          const nm = { ...ms };
          delete nm[id];
          next[mk] = nm;
        });
        return next;
      });
      // Primero la malla y los días especiales; el trabajador al final, para no dejar datos huérfanos
      const scheduleDeleted = await dbWrite(
        supabase.from('schedule_data').delete().eq('worker_id', id),
        'la eliminación de la malla del trabajador'
      );
      if (!scheduleDeleted) return;
      const specialDeleted = await dbWrite(
        supabase.from('special_days_v2').delete().eq('worker_id', id),
        'la eliminación de los días especiales'
      );
      if (!specialDeleted) return;
      await dbWrite(
        supabase.from('workers').delete().eq('id', id),
        'la eliminación del trabajador'
      );
    },
    [supabase]
  );

  // ── Shifts ──
  const addShift = useCallback(
    async (s: Shift) => {
      setShifts((prev) => ({ ...prev, [s.code]: s }));
      await dbWrite(
        supabase.from('shifts').upsert(shiftToRow(s), { onConflict: 'code' }),
        'el turno'
      );
    },
    [supabase]
  );

  const updateShift = useCallback(
    async (s: Shift) => {
      setShifts((prev) => ({ ...prev, [s.code]: s }));
      await dbWrite(
        supabase.from('shifts').upsert(shiftToRow(s), { onConflict: 'code' }),
        'el turno'
      );
    },
    [supabase]
  );

  const deleteShift = useCallback(
    async (code: string) => {
      setShifts((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      // Remove deleted shift from all schedule rows in state
      setScheduleData((prev) => {
        const next: ScheduleData = {};
        Object.entries(prev).forEach(([mk, ms]) => {
          next[mk] = {};
          Object.entries(ms).forEach(([wId, days]) => {
            next[mk][wId] = days.map((d) => (d === code ? null : d));
          });
        });
        return next;
      });
      if (
        !(await dbWrite(
          supabase.from('shifts').delete().eq('code', code),
          'la eliminación del turno'
        ))
      )
        return;
      // Actualizar solo las filas de la malla que contienen este turno
      let affectedRows: Record<string, unknown>[];
      try {
        affectedRows = await fetchAll((from, to) =>
          supabase
            .from('schedule_data')
            .select('id, days')
            .contains('days', [code])
            .order('id')
            .range(from, to)
        );
      } catch (error) {
        console.error('Error buscando mallas con el turno eliminado:', error);
        return;
      }
      await Promise.all(
        (affectedRows || []).map((row) => {
          const days = (row.days as ShiftCode[]).map((d) => (d === code ? null : d));
          return dbWrite(
            supabase.from('schedule_data').update({ days }).eq('id', row.id),
            'la malla'
          );
        })
      );
    },
    [supabase]
  );

  // Keep a ref to always have the latest scheduleData for async DB writes
  const scheduleDataRef = useRef<ScheduleData>({});
  useEffect(() => {
    scheduleDataRef.current = scheduleData;
  }, [scheduleData]);

  // Keep a ref to always have the latest specialDays for sync reads in callbacks
  const specialDaysRef = useRef<SpecialDaysData>({});
  useEffect(() => {
    specialDaysRef.current = specialDays;
  }, [specialDays]);

  // ── Schedule (per-month) ──
  const setCellShift = useCallback(
    (
      workerId: string,
      dayIndex: number,
      shift: ShiftCode,
      overrideMonthKey?: string
    ): Promise<boolean> => {
      const monthKey = overrideMonthKey ?? monthLabelToKey(selectedMes);

      // Never overwrite a cell that already has a special day (DESCANSO, LICENCIA, etc.)
      const existingSpecial = (specialDaysRef.current[monthKey] || {})[workerId]?.[dayIndex];
      if (existingSpecial) {
        return Promise.resolve(true); // silently skip — special day takes priority
      }

      // Read the current array synchronously from the ref BEFORE any async gap.
      // This is the same pattern used by bulkAssign and avoids the setTimeout race
      // condition where the ref might not yet reflect the latest optimistic state.
      const currentArr = [
        ...((scheduleDataRef.current[monthKey] || {})[workerId] || Array(31).fill(null)),
      ];
      currentArr[dayIndex] = shift;

      // Update React state optimistically
      setScheduleData((prev) => {
        const monthSched = prev[monthKey] || {};
        return { ...prev, [monthKey]: { ...monthSched, [workerId]: currentArr } };
      });

      // Persistir solo esta celda: es atómico en la BD, así dos ediciones simultáneas no se pisan
      return (async (): Promise<boolean> => {
        const { error } = await supabase.rpc('set_schedule_cell', {
          p_month_key: monthKey,
          p_worker_id: workerId,
          p_day_index: dayIndex,
          p_shift: shift,
        });
        if (error) {
          console.error('setCellShift error:', error);
          toast.error('No se pudo guardar el turno. Intenta de nuevo.');
          return false;
        }
        return true;
      })();
    },
    [selectedMes, supabase]
  );

  const bulkAssign = useCallback(
    async (workerIds: string[], dayIndices: number[], shift: ShiftCode): Promise<boolean> => {
      const monthKey = monthLabelToKey(selectedMes);
      // Compute updated arrays from current ref snapshot, skipping cells that have special days
      const currentMonthSched = scheduleDataRef.current[monthKey] || {};
      const currentSpecialDays = specialDaysRef.current[monthKey] || {};
      const updatedArrays: Record<string, ShiftCode[]> = {};
      workerIds.forEach((id) => {
        const arr = [...(currentMonthSched[id] || Array(31).fill(null))];
        const workerSpecial = currentSpecialDays[id] || {};
        dayIndices.forEach((di) => {
          // Never overwrite a cell that already has a special day
          if (!workerSpecial[di]) {
            arr[di] = shift;
          }
        });
        updatedArrays[id] = arr;
      });
      // Update React state
      setScheduleData((prev) => {
        const monthSched = { ...(prev[monthKey] || {}) };
        Object.entries(updatedArrays).forEach(([id, arr]) => {
          monthSched[id] = arr;
        });
        return { ...prev, [monthKey]: monthSched };
      });

      // Persistir: la BD cambia solo esas casillas de cada trabajador (atómico), así no se
      // pisan cambios que otra persona haya hecho en otros días del mismo trabajador.
      let hasError = false;
      await Promise.all(
        workerIds.map((id) =>
          supabase
            .rpc('set_schedule_cells', {
              p_month_key: monthKey,
              p_worker_id: id,
              p_day_indices: dayIndices,
              p_shift: shift,
            })
            .then(({ data, error }) => {
              if (error) {
                console.error('bulkAssign error:', error);
                hasError = true;
                return;
              }
              if (Array.isArray(data)) {
                setScheduleData((prev) => ({
                  ...prev,
                  [monthKey]: { ...(prev[monthKey] || {}), [id]: data as ShiftCode[] },
                }));
              }
            })
        )
      );
      if (hasError) toast.error('Algunos turnos no se pudieron guardar. Intenta de nuevo.');

      return !hasError;
    },
    [selectedMes, supabase]
  );

  const getScheduleForWorker = useCallback(
    (workerId: string): ShiftCode[] => {
      const monthKey = monthLabelToKey(selectedMes);
      return (scheduleData[monthKey] || {})[workerId] || Array(31).fill(null);
    },
    [scheduleData, selectedMes]
  );

  // ── Special Days ──
  const setSpecialDay = useCallback(
    async (
      workerId: string,
      dayIndex: number,
      typeCode: string | null,
      overrideMonthKey?: string
    ) => {
      const monthKey = overrideMonthKey ?? monthLabelToKey(selectedMes);

      // Build the updated days object FIRST (before any state updates)
      // so we have the correct value to persist to DB
      const currentWorkerDays = { ...((specialDaysRef.current[monthKey] || {})[workerId] || {}) };
      if (typeCode === null) {
        delete currentWorkerDays[dayIndex];
      } else {
        currentWorkerDays[dayIndex] = typeCode;
      }

      // Convert numeric keys to string keys for JSONB storage
      const daysForDb: Record<string, string> = {};
      Object.entries(currentWorkerDays).forEach(([k, v]) => {
        daysForDb[String(k)] = v;
      });

      // Optimistically update React state
      setSpecialDaysState((prev) => {
        const monthData = { ...(prev[monthKey] || {}) };
        const workerData = { ...(monthData[workerId] || {}) };
        if (typeCode === null) {
          delete workerData[dayIndex];
        } else {
          workerData[dayIndex] = typeCode;
        }
        monthData[workerId] = workerData;
        return { ...prev, [monthKey]: monthData };
      });

      // When assigning any special day, also clear any shift for this cell in React state
      if (typeCode !== null) {
        setScheduleData((prev) => {
          const monthSched = prev[monthKey] || {};
          const arr = [...(monthSched[workerId] || Array(31).fill(null))];
          if (arr[dayIndex] !== null) {
            arr[dayIndex] = null;
            return { ...prev, [monthKey]: { ...monthSched, [workerId]: arr } };
          }
          return prev;
        });
      }

      // Una sola llamada atómica: guarda el día especial y, si se asigna, limpia el turno de esa celda
      const { error } = await supabase.rpc('set_special_day_cell', {
        p_month_key: monthKey,
        p_worker_id: workerId,
        p_day_index: dayIndex,
        p_type_code: typeCode,
      });
      if (error) {
        console.error('setSpecialDay error:', error);
        toast.error('No se pudo guardar el día especial. Intenta de nuevo.');
      }
    },
    [selectedMes, supabase]
  );

  const bulkAssignSpecialDay = useCallback(
    async (workerIds: string[], dayIndices: number[], typeCode: string | null) => {
      const monthKey = monthLabelToKey(selectedMes);

      // Optimistically update React state
      setSpecialDaysState((prev) => {
        const monthData = { ...(prev[monthKey] || {}) };
        workerIds.forEach((wId) => {
          const workerData = { ...(monthData[wId] || {}) };
          dayIndices.forEach((di) => {
            if (typeCode === null) {
              delete workerData[di];
            } else {
              workerData[di] = typeCode;
            }
          });
          monthData[wId] = workerData;
        });
        return { ...prev, [monthKey]: monthData };
      });

      // When assigning any special day, also clear shifts for those cells in state
      if (typeCode !== null) {
        setScheduleData((prev) => {
          const monthSched = { ...(prev[monthKey] || {}) };
          let changed = false;
          workerIds.forEach((wId) => {
            const arr = [...(monthSched[wId] || Array(31).fill(null))];
            dayIndices.forEach((di) => {
              if (arr[di] !== null) {
                arr[di] = null;
                changed = true;
              }
            });
            if (changed) monthSched[wId] = arr;
          });
          return changed ? { ...prev, [monthKey]: monthSched } : prev;
        });
      }

      // Persistir de forma atómica por trabajador (solo esas casillas)
      let hasError = false;
      await Promise.all(
        workerIds.map(async (wId) => {
          const { error } = await supabase.rpc('set_special_day_cells', {
            p_month_key: monthKey,
            p_worker_id: wId,
            p_day_indices: dayIndices,
            p_type_code: typeCode,
          });
          if (error) {
            console.error('bulkAssignSpecialDay error:', error);
            hasError = true;
          }
        })
      );
      if (hasError) toast.error('Algunos días especiales no se pudieron guardar.');
    },
    [selectedMes, supabase]
  );

  const getSpecialDaysForWorker = useCallback(
    (workerId: string): Record<number, string> => {
      const monthKey = monthLabelToKey(selectedMes);
      return (specialDays[monthKey] || {})[workerId] || {};
    },
    [specialDays, selectedMes]
  );

  // ── Sucursales ──
  const addSucursal = useCallback(
    async (name: string, cajas: number = 20) => {
      setSucursales((prev) =>
        prev.some((s) => s.name === name) ? prev : [...prev, { name, cajas }]
      );
      await dbWrite(
        supabase.from('sucursales').upsert({ name, cajas }, { onConflict: 'name' }),
        'la sucursal'
      );
    },
    [supabase]
  );

  const updateSucursal = useCallback(
    async (oldName: string, newName: string, cajas?: number) => {
      setSucursales((prev) =>
        prev.map((s) =>
          s.name === oldName ? { name: newName, cajas: cajas !== undefined ? cajas : s.cajas } : s
        )
      );
      setWorkers((prev) =>
        prev.map((w) => (w.sucursal === oldName ? { ...w, sucursal: newName } : w))
      );
      if (oldName !== newName) {
        // Crear la nueva primero y borrar la antigua al final: si algo falla no se pierde la sucursal
        const newCajas = cajas !== undefined ? cajas : 20;
        const ok =
          (await dbWrite(
            supabase
              .from('sucursales')
              .upsert({ name: newName, cajas: newCajas }, { onConflict: 'name' }),
            'la sucursal'
          )) &&
          (await dbWrite(
            supabase.from('workers').update({ sucursal: newName }).eq('sucursal', oldName),
            'la sucursal de los trabajadores'
          )) &&
          (await dbWrite(
            supabase.from('sucursales').delete().eq('name', oldName),
            'el cambio de nombre de la sucursal'
          ));
        if (!ok)
          toast.error(
            'El cambio de nombre quedó incompleto. Recarga la página y revisa la sucursal.'
          );
      } else if (cajas !== undefined) {
        await dbWrite(
          supabase.from('sucursales').update({ cajas }).eq('name', oldName),
          'la sucursal'
        );
      }
    },
    [supabase]
  );

  const deleteSucursal = useCallback(
    async (name: string) => {
      setSucursales((prev) => prev.filter((s) => s.name !== name));
      await dbWrite(
        supabase.from('sucursales').delete().eq('name', name),
        'la eliminación de la sucursal'
      );
    },
    [supabase]
  );

  const getSucursalCajas = useCallback(
    (name: string): number => {
      const found = sucursales.find((s) => s.name === name);
      return found ? found.cajas : 20;
    },
    [sucursales]
  );

  // ── Areas ──
  const addArea = useCallback(
    async (name: string) => {
      setAreas((prev) => (prev.includes(name) ? prev : [...prev, name]));
      await dbWrite(supabase.from('areas').upsert({ name }, { onConflict: 'name' }), 'el área');
    },
    [supabase]
  );

  const updateArea = useCallback(
    async (oldName: string, newName: string) => {
      setAreas((prev) => prev.map((a) => (a === oldName ? newName : a)));
      setWorkers((prev) => prev.map((w) => (w.area === oldName ? { ...w, area: newName } : w)));
      setAreaCargosState((prev) => {
        const next = { ...prev };
        if (next[oldName]) {
          next[newName] = next[oldName];
          delete next[oldName];
        }
        return next;
      });
      if (oldName !== newName) {
        // Crear la nueva primero y borrar la antigua al final: si algo falla no se pierde el área
        let ok =
          (await dbWrite(
            supabase.from('areas').upsert({ name: newName }, { onConflict: 'name' }),
            'el área'
          )) &&
          (await dbWrite(
            supabase.from('workers').update({ area: newName }).eq('area', oldName),
            'el área de los trabajadores'
          ));
        // Move area_cargos
        const { data: existing } = await supabase
          .from('area_cargos')
          .select('cargos')
          .eq('area_name', oldName)
          .maybeSingle();
        if (ok && existing) {
          ok =
            (await dbWrite(
              supabase
                .from('area_cargos')
                .upsert(
                  { area_name: newName, cargos: existing.cargos },
                  { onConflict: 'area_name' }
                ),
              'los cargos del área'
            )) &&
            (await dbWrite(
              supabase.from('area_cargos').delete().eq('area_name', oldName),
              'los cargos del área'
            ));
        }
        if (ok)
          ok = await dbWrite(
            supabase.from('areas').delete().eq('name', oldName),
            'el cambio de nombre del área'
          );
        if (!ok)
          toast.error('El cambio de nombre quedó incompleto. Recarga la página y revisa el área.');
      }
    },
    [supabase]
  );

  const deleteArea = useCallback(
    async (name: string) => {
      setAreas((prev) => prev.filter((a) => a !== name));
      setAreaCargosState((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      await dbWrite(
        supabase.from('area_cargos').delete().eq('area_name', name),
        'los cargos del área'
      );
      await dbWrite(supabase.from('areas').delete().eq('name', name), 'la eliminación del área');
    },
    [supabase]
  );

  // ── Area Cargos ──
  const setAreaCargos = useCallback(
    async (area: string, cargos: string[]) => {
      setAreaCargosState((prev) => ({ ...prev, [area]: cargos }));
      await dbWrite(
        supabase
          .from('area_cargos')
          .upsert({ area_name: area, cargos }, { onConflict: 'area_name' }),
        'los cargos del área'
      );
    },
    [supabase]
  );

  // ── Custom Non-Working Types ──
  const addCustomNonWorkingType = useCallback(
    async (t: NonWorkingType) => {
      setCustomNonWorkingTypes((prev) => [...prev, t]);
      await dbWrite(
        supabase.from('custom_non_working_types').upsert(nwtToRow(t), { onConflict: 'code' }),
        'el tipo de día especial'
      );
    },
    [supabase]
  );

  const updateCustomNonWorkingType = useCallback(
    async (t: NonWorkingType) => {
      setCustomNonWorkingTypes((prev) => prev.map((x) => (x.code === t.code ? t : x)));
      await dbWrite(
        supabase.from('custom_non_working_types').upsert(nwtToRow(t), { onConflict: 'code' }),
        'el tipo de día especial'
      );
    },
    [supabase]
  );

  const deleteCustomNonWorkingType = useCallback(
    async (code: string) => {
      setCustomNonWorkingTypes((prev) => prev.filter((x) => x.code !== code));
      setSpecialDaysState((prev) => {
        const next: SpecialDaysData = {};
        Object.entries(prev).forEach(([mk, md]) => {
          next[mk] = {};
          Object.entries(md).forEach(([wId, wd]) => {
            const cleaned: Record<number, string> = {};
            Object.entries(wd).forEach(([di, tc]) => {
              if (tc !== code) cleaned[Number(di)] = tc;
            });
            next[mk][wId] = cleaned;
          });
        });
        return next;
      });
      // Quitar el tipo de todas las mallas (special_days_v2 y la tabla antigua) y luego borrarlo
      if (
        await dbWrite(
          supabase.rpc('remove_special_day_type', { p_code: code }),
          'la limpieza del tipo de día especial'
        )
      ) {
        await dbWrite(
          supabase.from('custom_non_working_types').delete().eq('code', code),
          'la eliminación del tipo de día especial'
        );
      }
    },
    [supabase]
  );

  // ── Licencias ──
  // Agrupa fechas "YYYY-MM-DD" por mes: { "2026-10": [21, 22], "2026-11": [0] }
  function groupByMonth(dates: string[]): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    dates.forEach((d) => {
      const mk = d.slice(0, 7);
      (out[mk] ||= []).push(Number(d.slice(8, 10)) - 1);
    });
    return out;
  }

  const registrarLicencia = useCallback(
    async (
      workerId: string,
      desde: string,
      dias: number,
      tipo: TipoAusencia = 'LICENCIA',
      motivo = ''
    ): Promise<boolean> => {
      const allDates = Array.from({ length: dias }, (_, i) => addDaysISO(desde, i));
      // Hay que tener cargados esos meses para saber qué turno tenía
      await ensureMonths([...new Set(allDates.map((d) => d.slice(0, 7)))]);
      // Lo que había antes en la malla, para mostrarlo y poder devolverlo
      const turnos: Record<string, string> = {};
      const especiales: Record<string, string> = {};
      const conTurno = new Set<string>();
      allDates.forEach((d) => {
        const mk = d.slice(0, 7);
        const di = Number(d.slice(8, 10)) - 1;
        const sp = ((specialDaysRef.current[mk] || {})[workerId] || {})[di];
        const sh = ((scheduleDataRef.current[mk] || {})[workerId] || [])[di];
        if (sp && sp !== tipo) especiales[d] = sp;
        else if (sh) {
          turnos[d] = sh;
          if (!sp && sh !== 'DESC' && sh !== 'NOT') conTurno.add(d);
        }
      });
      // La licencia corre todos los días; un permiso o vacaciones solo los días con turno
      const dates = tipo === 'LICENCIA' ? allDates : allDates.filter((d) => conTurno.has(d));
      if (dates.length === 0) {
        toast.error('Esos días no tiene turno: ya está libre, no necesita permiso.');
        return false;
      }
      if (tipo !== 'LICENCIA') {
        Object.keys(especiales).forEach((d) => delete especiales[d]);
        Object.keys(turnos).forEach((d) => !conTurno.has(d) && delete turnos[d]);
      }

      const { data, error } = await supabase
        .from('licencias')
        .insert({ worker_id: workerId, desde, dias, turnos, especiales, tipo, motivo })
        .select()
        .single();
      if (error || !data) {
        console.error('registrarLicencia error:', error);
        toast.error('No se pudo guardar. Intenta de nuevo.');
        return false;
      }
      setLicencias((prev) => [...prev, rowToLicencia(data as Record<string, unknown>)]);

      const byMonth = groupByMonth(dates);
      setSpecialDaysState((prev) => {
        const next = { ...prev };
        Object.entries(byMonth).forEach(([mk, idxs]) => {
          const workerData = { ...((next[mk] || {})[workerId] || {}) };
          idxs.forEach((di) => (workerData[di] = tipo));
          next[mk] = { ...(next[mk] || {}), [workerId]: workerData };
        });
        return next;
      });
      setScheduleData((prev) => {
        const next = { ...prev };
        Object.entries(byMonth).forEach(([mk, idxs]) => {
          const arr = [...((next[mk] || {})[workerId] || Array(31).fill(null))];
          idxs.forEach((di) => (arr[di] = null));
          next[mk] = { ...(next[mk] || {}), [workerId]: arr };
        });
        return next;
      });

      let ok = true;
      for (const [mk, idxs] of Object.entries(byMonth)) {
        const { error: e } = await supabase.rpc('set_special_day_cells', {
          p_month_key: mk,
          p_worker_id: workerId,
          p_day_indices: idxs,
          p_type_code: tipo,
        });
        if (e) {
          console.error('registrarLicencia malla error:', e);
          ok = false;
        }
      }
      if (!ok) toast.error('Quedó registrado, pero algunos días no se marcaron en la malla.');
      return ok;
    },
    [supabase, ensureMonths]
  );

  const quitarLicencia = useCallback(
    async (id: string): Promise<boolean> => {
      const lic = licencias.find((l) => l.id === id);
      if (!lic) return false;
      const dates = Array.from({ length: lic.dias }, (_, i) => addDaysISO(lic.desde, i));
      await ensureMonths([...new Set(dates.map((d) => d.slice(0, 7)))]);
      // Solo los días que siguen marcados (si alguien ya los cambió a mano, se respetan)
      const still = dates.filter((d) => {
        const mk = d.slice(0, 7);
        const di = Number(d.slice(8, 10)) - 1;
        return ((specialDaysRef.current[mk] || {})[lic.workerId] || {})[di] === lic.tipo;
      });

      let ok = true;
      for (const [mk, idxs] of Object.entries(groupByMonth(still))) {
        const { error } = await supabase.rpc('set_special_day_cells', {
          p_month_key: mk,
          p_worker_id: lic.workerId,
          p_day_indices: idxs,
          p_type_code: null,
        });
        if (error) ok = false;
      }
      // Devolver los turnos y días especiales que tenía
      for (const d of still) {
        const mk = d.slice(0, 7);
        const di = Number(d.slice(8, 10)) - 1;
        if (lic.especiales[d]) {
          const { error } = await supabase.rpc('set_special_day_cell', {
            p_month_key: mk,
            p_worker_id: lic.workerId,
            p_day_index: di,
            p_type_code: lic.especiales[d],
          });
          if (error) ok = false;
        } else if (lic.turnos[d]) {
          const { error } = await supabase.rpc('set_schedule_cell', {
            p_month_key: mk,
            p_worker_id: lic.workerId,
            p_day_index: di,
            p_shift: lic.turnos[d],
          });
          if (error) ok = false;
        }
      }

      setSpecialDaysState((prev) => {
        const next = { ...prev };
        still.forEach((d) => {
          const mk = d.slice(0, 7);
          const di = Number(d.slice(8, 10)) - 1;
          const workerData = { ...((next[mk] || {})[lic.workerId] || {}) };
          if (lic.especiales[d]) workerData[di] = lic.especiales[d];
          else delete workerData[di];
          next[mk] = { ...(next[mk] || {}), [lic.workerId]: workerData };
        });
        return next;
      });
      setScheduleData((prev) => {
        const next = { ...prev };
        still.forEach((d) => {
          if (!lic.turnos[d] || lic.especiales[d]) return;
          const mk = d.slice(0, 7);
          const di = Number(d.slice(8, 10)) - 1;
          const arr = [...((next[mk] || {})[lic.workerId] || Array(31).fill(null))];
          arr[di] = lic.turnos[d];
          next[mk] = { ...(next[mk] || {}), [lic.workerId]: arr };
        });
        return next;
      });

      if (!ok) {
        toast.error('No se pudieron devolver todos los turnos. Revisa la malla de esos días.');
        return false;
      }
      const { error } = await supabase.from('licencias').delete().eq('id', id);
      if (error) {
        toast.error('No se pudo quitar la licencia. Intenta de nuevo.');
        return false;
      }
      setLicencias((prev) => prev.filter((l) => l.id !== id));
      return true;
    },
    [licencias, supabase, ensureMonths]
  );

  const resolverAvisoLicencia = useCallback(
    async (id: string) => {
      setLicencias((prev) => prev.map((l) => (l.id === id ? { ...l, avisoResuelto: true } : l)));
      const { error } = await supabase
        .from('licencias')
        .update({ aviso_resuelto: true })
        .eq('id', id);
      if (error) {
        console.error('resolverAvisoLicencia error:', error);
        setLicencias((prev) => prev.map((l) => (l.id === id ? { ...l, avisoResuelto: false } : l)));
        toast.error('No se pudo guardar. Intenta de nuevo.');
      }
    },
    [supabase]
  );

  const getLicenciaTurno = useCallback(
    (workerId: string, dateStr: string): string | undefined => {
      const lic = licencias.find(
        (l) => l.workerId === workerId && l.desde <= dateStr && dateStr <= l.hasta
      );
      return lic?.turnos[dateStr];
    },
    [licencias]
  );

  const getAllNonWorkingTypes = useCallback((): NonWorkingType[] => {
    return [...NON_WORKING_TYPES, ...customNonWorkingTypes];
  }, [customNonWorkingTypes]);

  return (
    <AppContext.Provider
      value={{
        workers,
        shifts,
        scheduleData: scheduleDataView,
        specialDays: specialDaysView,
        ensureMonths,
        loadMonths,
        isMonthLoaded,
        sucursales: visibleSucursales,
        areas: visibleAreas,
        areaCargos,
        selectedMes,
        setSelectedMes,
        globalSucursal,
        setGlobalSucursal,
        globalArea,
        setGlobalArea,
        customNonWorkingTypes,
        loading,
        addWorker,
        updateWorker,
        deleteWorker,
        addShift,
        updateShift,
        deleteShift,
        setCellShift,
        bulkAssign,
        getScheduleForWorker,
        setSpecialDay,
        bulkAssignSpecialDay,
        getSpecialDaysForWorker,
        addSucursal,
        updateSucursal,
        deleteSucursal,
        getSucursalCajas,
        addArea,
        updateArea,
        deleteArea,
        setAreaCargos,
        addCustomNonWorkingType,
        updateCustomNonWorkingType,
        deleteCustomNonWorkingType,
        getAllNonWorkingTypes,
        licencias,
        registrarLicencia,
        quitarLicencia,
        resolverAvisoLicencia,
        getLicenciaTurno,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}

// Feriados nacionales de Chile. Devuelve índices de día (0 = día 1) del mes indicado.
export function getChileanHolidays(monthIdx: number, year: number): number[] {
  const dates: Date[] = [];
  const add = (m: number, d: number) => dates.push(new Date(year, m, d));
  const dow = (m: number, d: number) => new Date(year, m, d).getDay();

  // Feriados de fecha fija
  const fixed: [number, number][] = [
    [0, 1], // Año Nuevo
    [4, 1], // Día del Trabajo
    [4, 21], // Glorias Navales
    [6, 16], // Virgen del Carmen
    [7, 15], // Asunción de la Virgen
    [8, 18], // Independencia Nacional
    [8, 19], // Glorias del Ejército
    [10, 1], // Todos los Santos
    [11, 8], // Inmaculada Concepción
    [11, 25], // Navidad
  ];
  fixed.forEach(([m, d]) => add(m, d));

  // Ley 19.668: San Pedro y San Pablo y Encuentro de Dos Mundos se corren al lunes.
  // Mar/Mié/Jue -> lunes de esa semana; Vie -> lunes siguiente.
  const movable = (m: number, d: number) => {
    const w = dow(m, d);
    if (w >= 2 && w <= 4) add(m, d - (w - 1));
    else if (w === 5) add(m, d + 3);
    else add(m, d);
  };
  movable(5, 29);
  movable(9, 12);

  // Ley 20.299: Iglesias Evangélicas. Si el 31/10 cae martes -> viernes 27/10;
  // si cae miércoles -> viernes 2/11.
  const evang = dow(9, 31);
  if (evang === 2) add(9, 27);
  else if (evang === 3) add(10, 2);
  else add(9, 31);

  // Ley 20.215: si el 18/9 cae martes, el 17/9 es feriado; si cae miércoles, el 20/9.
  const sept18 = dow(8, 18);
  if (sept18 === 2) add(8, 17);
  else if (sept18 === 3) add(8, 20);

  // Ley 21.357: Día Nacional de los Pueblos Indígenas, día del solsticio de invierno (hora de Chile).
  if (year >= 2021) {
    const y = (year - 2000) / 1000;
    const jde =
      2451716.56767 + 365241.62603 * y + 0.00325 * y * y + 0.00888 * y ** 3 - 0.0003 * y ** 4;
    const utcMs = (jde - 2440587.5) * 86400000;
    const chile = new Date(utcMs - 4 * 3600000);
    add(5, chile.getUTCDate());
  }

  // Semana Santa
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d2 = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d2 - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m2 + 114) / 31) - 1;
  const easterDay = ((h + l - 7 * m2 + 114) % 31) + 1;
  add(easterMonth, easterDay - 2); // Viernes Santo
  add(easterMonth, easterDay - 1); // Sábado Santo

  const holidays: number[] = [];
  dates.forEach((dt) => {
    if (dt.getMonth() === monthIdx && !holidays.includes(dt.getDate() - 1)) {
      holidays.push(dt.getDate() - 1);
    }
  });
  return holidays;
}

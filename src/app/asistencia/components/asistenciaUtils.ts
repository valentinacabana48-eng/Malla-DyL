// ─── Custom Date Range helpers ────────────────────────────────────────────────

export interface PeriodOption {
  label: string;
  key: string;
  startDate: string;
  endDate: string;
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/** Build a period key from two date strings */
export function buildCustomPeriodKey(startDate: string, endDate: string): string {
  return `${startDate}_${endDate}`;
}

/** Get dates between two date strings (inclusive) */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    );
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Default start: 1st of current month */
export function getDefaultStartDate(): string {
  const now = new Date();
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Default end: last day of the current month */
export function getDefaultEndDate(startDate: string): string {
  const [y, m] = startDate.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function formatPeriodLabel(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  return `${sd} ${MONTH_NAMES[sm - 1]} – ${ed} ${MONTH_NAMES[em - 1]} ${ey}`;
}

// ─── Legacy helpers kept for backward compat ─────────────────────────────────

export function buildPeriods(count = 12): PeriodOption[] {
  const periods: PeriodOption[] = [];
  const now = new Date();
  for (let i = -6; i < count - 6; i++) {
    let month = now.getMonth() + 1 + i;
    let year = now.getFullYear();
    while (month > 12) { month -= 12; year++; }
    while (month < 1) { month += 12; year--; }
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    periods.push({
      label: `22 ${MONTH_NAMES[month - 1]} – 21 ${MONTH_NAMES[endMonth - 1]} ${endYear}`,
      key,
      startDate: `${year}-${String(month).padStart(2, '0')}-22`,
      endDate: `${endYear}-${String(endMonth).padStart(2, '0')}-21`,
    });
  }
  return periods;
}

export function getCurrentPeriodKey(): string {
  const now = new Date();
  const day = now.getDate();
  let month = now.getMonth() + 1;
  let year = now.getFullYear();
  if (day < 22) {
    month -= 1;
    if (month < 1) { month = 12; year--; }
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getDatesInPeriod(periodKey: string): string[] {
  const [year, month] = periodKey.split('-').map(Number);
  const endMonth = month === 12 ? 1 : month + 1;
  const endYear = month === 12 ? year + 1 : year;
  const dates: string[] = [];
  const daysInStartMonth = new Date(year, month, 0).getDate();
  for (let d = 22; d <= daysInStartMonth; d++) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  for (let d = 1; d <= 21; d++) {
    dates.push(`${endYear}-${String(endMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return dates;
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function formatDateLabel(dateStr: string): { day: number; dow: string; monthShort: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const DOW = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return { day: d, dow: DOW[date.getDay()], monthShort: MONTHS[m - 1] };
}

export const ABSENCE_REASONS = [
  'Falta injustificada',
  'Falta justificada',
  'Enfermedad',
  'Licencia médica',
  'Permiso con goce',
  'Permiso sin goce',
  'Vacaciones',
  'Accidente laboral',
  'Otro',
];

export const ATTENDANCE_STATUSES = [
  { code: 'PRESENTE',          label: 'Presente',           color: 'bg-green-100 text-green-800 border-green-300' },
  { code: 'AUSENTE',           label: 'Ausente',            color: 'bg-red-100 text-red-800 border-red-300' },
  { code: 'FALTA_JUSTIFICADA', label: 'Falta justificada',  color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { code: 'ENFERMEDAD',        label: 'Enfermedad',         color: 'bg-rose-100 text-rose-800 border-rose-300' },
  { code: 'DESCANSO',          label: 'Descanso',           color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { code: 'NT',                label: 'No trabajaba',       color: 'bg-gray-100 text-gray-500 border-gray-300' },
  { code: 'LICENCIA',          label: 'Licencia',           color: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { code: 'PERMISO',           label: 'Permiso',            color: 'bg-teal-100 text-teal-800 border-teal-300' },
  { code: 'VACACIONES',        label: 'Vacaciones',         color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { code: 'CUMPLEANOS',        label: 'Cumpleaños',         color: 'bg-pink-100 text-pink-700 border-pink-300' },
];

export function getStatusStyle(code: string): string {
  return ATTENDANCE_STATUSES.find(s => s.code === code)?.color ?? 'bg-gray-100 text-gray-700 border-gray-300';
}

export function getStatusLabel(code: string): string {
  return ATTENDANCE_STATUSES.find(s => s.code === code)?.label ?? code;
}

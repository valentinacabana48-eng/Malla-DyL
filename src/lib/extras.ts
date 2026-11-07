// Ayudas del módulo Extras: fechas largas y montos en pesos.

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "2026-11-07" → "sábado 7 de noviembre de 2026" */
export function fechaLargaAnio(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${d} de ${MES[m - 1]} de ${y}`;
}

/** 25000 → "$25.000" */
export const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

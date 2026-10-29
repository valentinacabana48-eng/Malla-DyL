// RUT chileno: se compara sin puntos ni guion y se guarda siempre como 12.345.678-9.

/** RUT sin puntos ni guion, en mayúsculas (21.533.115-6 = 215331156) */
export function normalizeRut(rut: string): string {
  return (rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
}

/** RUT con puntos y guion (215331156 → 21.533.115-6); vacío si no trae RUT */
export function formatRut(rut: string): string {
  const clean = normalizeRut(rut).replace(/^0+/, '');
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${clean.slice(-1)}`;
}

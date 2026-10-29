// Iniciales del círculo de cada trabajadora (Anderson Hidalgo → AH).

/** Dos letras: inicial del nombre y del apellido; con una sola palabra, sus dos primeras letras */
export function getInitials(name: string): string {
  // Los espacios dobles («Anderson  Hidalgo») no cuentan como palabra vacía
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Las iniciales guardadas, o las del nombre si vienen vacías o malas (p. ej. «AUNDEFINED») */
export function safeInitials(initials: string | null | undefined, name: string): string {
  const clean = (initials || '').trim();
  if (clean && clean.length <= 3 && !/undefined|null/i.test(clean)) return clean;
  return getInitials(name);
}

// Nombres de personas bien escritos: «juan PÉREZ de la fuente» → «Juan Pérez de la Fuente».
// La base de datos hace lo mismo al guardar (función public.nombre_bonito), esto es para
// que la pantalla lo muestre igual al instante, sin esperar a recargar.

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

export function nombreBonito(nombre: string | null | undefined): string {
  const palabras = (nombre || '').trim().split(/\s+/).filter(Boolean);
  return palabras
    .map((p, i) => {
      const min = p.toLocaleLowerCase('es');
      if (i > 0 && PARTICULAS.has(min)) return min;
      return min.charAt(0).toLocaleUpperCase('es') + min.slice(1);
    })
    .join(' ');
}

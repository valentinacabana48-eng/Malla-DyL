/**
 * Decoración de temporada de Mis turnos: cambia sola según el mes (hora de Chile).
 * Por ahora solo diciembre → Navidad. Para mirarla antes de tiempo: ?tema=navidad en la dirección.
 */
export type Tema = 'navidad' | null;

export function temaDelMes(): Tema {
  try {
    const pedido = new URLSearchParams(window.location.search).get('tema');
    if (pedido === 'navidad') return 'navidad';
    if (pedido === 'ninguno') return null;
  } catch {
    // sin dirección (no debería pasar en el navegador)
  }
  const mes = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', month: '2-digit' }).format(
      new Date()
    )
  );
  return mes === 12 ? 'navidad' : null;
}

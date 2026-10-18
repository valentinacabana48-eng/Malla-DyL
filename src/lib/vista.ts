'use client';
import { useEffect, useState } from 'react';

// Vista elegida a mano en este dispositivo: celular, computador o automática (según la pantalla).
// Se guarda en el navegador y se aplica como clase en <html> (vista-movil / vista-escritorio),
// que es lo que miran las variantes lg: y xl: de Tailwind.
export type Vista = 'auto' | 'movil' | 'escritorio';
export const VISTA_KEY = 'dyl_vista';

/** Script que corre antes de pintar la página, para que no se vea un salto de diseño */
export const VISTA_INIT_SCRIPT = `try{var v=localStorage.getItem('${VISTA_KEY}');if(v==='movil'||v==='escritorio')document.documentElement.classList.add('vista-'+v)}catch(e){}`;

export function getVista(): Vista {
  if (typeof document === 'undefined') return 'auto';
  const cl = document.documentElement.classList;
  if (cl.contains('vista-escritorio')) return 'escritorio';
  if (cl.contains('vista-movil')) return 'movil';
  return 'auto';
}

export function setVista(v: Vista) {
  try {
    if (v === 'auto') localStorage.removeItem(VISTA_KEY);
    else localStorage.setItem(VISTA_KEY, v);
  } catch {
    // sin localStorage la elección dura solo hasta recargar
  }
  // Se recarga para volver a calcular el ancho y el zoom de la pantalla
  window.location.reload();
}

/** Cómo se está viendo la app ahora (para el botón de cambiar) y si vale la pena ofrecer el cambio */
export function useVistaActual(): { actual: 'movil' | 'escritorio'; ofrecer: boolean } {
  const [state, setState] = useState<{ actual: 'movil' | 'escritorio'; ofrecer: boolean }>({
    actual: 'escritorio',
    ofrecer: false,
  });
  useEffect(() => {
    const v = getVista();
    const anchoEscritorio = window.matchMedia('(min-width: 1024px)').matches;
    const actual =
      v === 'escritorio' || (v === 'auto' && anchoEscritorio && !isPhoneInDesktopMode())
        ? 'escritorio'
        : 'movil';
    // Se ofrece en pantallas táctiles (teléfonos y tablets) o si ya se eligió una vista
    setState({ actual, ofrecer: navigator.maxTouchPoints > 0 || v !== 'auto' });
  }, []);
  return state;
}

/** Teléfono que abre la página con ancho de computador ("versión para computadora") */
export function isPhoneInDesktopMode(): boolean {
  const smallScreen = Math.min(window.screen.width, window.screen.height) < 600;
  return navigator.maxTouchPoints > 0 && smallScreen && window.innerWidth >= 900;
}

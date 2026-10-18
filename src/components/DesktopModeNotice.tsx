'use client';
import { useEffect } from 'react';
import { getVista } from '@/lib/vista';

// Algunos celulares abren la app en "Versión para computadora" (a veces sin que la persona
// lo haya activado, por ejemplo en la app instalada): el navegador finge una pantalla de
// ~980 px y achica todo para que quepa. Se detecta porque la pantalla real es angosta pero la
// página recibe un ancho de computador, y se compensa agrandando la app (zoom) para que
// quede del ancho real del teléfono. También se fija el alto para que el menú inferior
// quede dentro de la pantalla.
export default function DesktopModeNotice() {
  useEffect(() => {
    const root = document.documentElement;

    const viewport = document.querySelector('meta[name="viewport"]');
    const apply = () => {
      // Vista computador elegida a mano: sin zoom; en un teléfono normal se le da a la página
      // un ancho de computador para que quepa el diseño de escritorio
      if (getVista() === 'escritorio') {
        root.style.removeProperty('zoom');
        root.style.removeProperty('--app-height');
        if (window.innerWidth < 1024) viewport?.setAttribute('content', 'width=1280');
        return;
      }
      const isTouch = navigator.maxTouchPoints > 0;
      const screenW = window.screen.width;
      const smallScreen = Math.min(window.screen.width, window.screen.height) < 600;
      // 0.92: la app queda un poco más ancha que el teléfono para que la letra no se vea enorme
      const zoom = (window.innerWidth / screenW) * 0.92;
      if (isTouch && smallScreen && window.innerWidth >= 900 && zoom > 1.2) {
        root.style.setProperty('zoom', String(zoom));
        root.style.setProperty('--app-height', `${window.innerHeight / zoom}px`);
      } else {
        root.style.removeProperty('zoom');
        root.style.removeProperty('--app-height');
      }
    };

    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  return null;
}

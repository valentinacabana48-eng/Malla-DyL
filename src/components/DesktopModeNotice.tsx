'use client';
import { useEffect } from 'react';

// Algunos celulares abren la app en "Versión para computadora" (a veces sin que la persona
// lo haya activado, por ejemplo en la app instalada): el navegador finge una pantalla de
// ~980 px y achica todo para que quepa. Se detecta porque la pantalla real es angosta pero la
// página recibe un ancho de computador, y se compensa agrandando la app (zoom) para que
// quede del ancho real del teléfono. También se fija el alto para que el menú inferior
// quede dentro de la pantalla.
export default function DesktopModeNotice() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const isTouch = navigator.maxTouchPoints > 0;
      const screenW = window.screen.width;
      const smallScreen = Math.min(window.screen.width, window.screen.height) < 600;
      const zoom = window.innerWidth / screenW;
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

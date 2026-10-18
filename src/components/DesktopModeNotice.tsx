'use client';
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Si el navegador del celular está en "Versión para computadora", el teléfono finge una
// pantalla ancha y achica toda la app para que quepa. Se detecta porque la pantalla real
// es angosta pero la página recibe un ancho de computador, y se explica cómo desactivarlo.
export default function DesktopModeNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('desktop_mode_notice_closed')) return;
    } catch {
      // sessionStorage no disponible: el aviso se muestra igual
    }
    const isTouch = navigator.maxTouchPoints > 0;
    const smallScreen = Math.min(window.screen.width, window.screen.height) < 600;
    const wideLayout = window.innerWidth >= 900;
    setShow(isTouch && smallScreen && wideLayout);
  }, []);

  if (!show) return null;

  const close = () => {
    setShow(false);
    try {
      sessionStorage.setItem('desktop_mode_notice_closed', '1');
    } catch {
      // no es crítico
    }
  };

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[10000] bg-amber-400 text-amber-950 px-6 py-5 shadow-lg"
      style={{ fontSize: 40, lineHeight: 1.3 }}
    >
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <p style={{ fontWeight: 800 }}>Tu navegador está en «Versión para computadora»</p>
          <p style={{ marginTop: 12 }}>
            Por eso la app se ve chica. En Chrome toca los 3 puntos (⋮) arriba a la derecha y
            desmarca «Versión para computadora». En Safari toca «aA» y elige «Solicitar sitio web
            móvil».
          </p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar aviso"
          className="shrink-0 rounded-xl"
          style={{
            width: 88,
            height: 88,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <X size={48} />
        </button>
      </div>
    </div>
  );
}

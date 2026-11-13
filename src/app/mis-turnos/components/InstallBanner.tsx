'use client';
import React, { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { useInstallPrompt, useIosInstallable } from '@/lib/pwa';
import IosInstallModal from '@/components/IosInstallModal';

const HIDE_KEY = 'dyl_mis_turnos_sin_instalar';

// Invita a dejar Mis turnos como app en la pantalla de inicio. En Android (Chrome) abre el
// aviso del navegador; en iPhone muestra los pasos de Safari. Se oculta si ya está instalada
// o si la trabajadora toca "Ahora no".
export default function InstallBanner() {
  const installApp = useInstallPrompt();
  const ios = useIosInstallable();
  const [hidden, setHidden] = useState(true);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDE_KEY) === '1');
    } catch {
      setHidden(false);
    }
  }, []);

  if (hidden || (!installApp && !ios)) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      // sin almacenamiento vuelve a aparecer la próxima vez
    }
  };

  return (
    <>
      {/* Fila compacta: va dentro de la franja de avisos de Mis turnos */}
      <div className="px-3 py-2 flex items-center gap-2.5">
        <Smartphone size={17} className="text-blue-700 shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-0 text-[13px] text-gray-700 leading-snug">
          Instala Mis turnos en tu celular
        </p>
        <button
          type="button"
          onClick={installApp ?? (() => setShowIos(true))}
          className="h-8 px-3 rounded-lg bg-blue-700 text-white text-[13px] font-bold shrink-0"
        >
          Instalar
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Ahora no"
          className="w-8 h-8 -mr-1 text-gray-400 flex items-center justify-center shrink-0"
        >
          <X size={15} />
        </button>
      </div>
      {showIos && (
        <IosInstallModal
          appName="Mis turnos"
          note="La primera vez que abras la app instalada, ingresa de nuevo con tu RUT y tu clave."
          onClose={() => setShowIos(false)}
        />
      )}
    </>
  );
}

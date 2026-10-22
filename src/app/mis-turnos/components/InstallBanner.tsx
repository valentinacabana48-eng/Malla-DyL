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
      <div className="bg-white rounded-2xl border border-blue-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <Smartphone size={20} className="text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-gray-900">Tenla en tu celular</p>
          <p className="text-[13px] text-gray-600 leading-snug">
            Instala Mis turnos y ábrela con un toque, como cualquier app.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={installApp ?? (() => setShowIos(true))}
            className="h-10 px-3.5 rounded-[10px] bg-blue-700 text-white text-sm font-bold"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="h-7 px-1 text-xs text-gray-500 flex items-center gap-1"
          >
            <X size={12} />
            Ahora no
          </button>
        </div>
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

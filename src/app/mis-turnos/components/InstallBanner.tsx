'use client';
import React, { useEffect, useState } from 'react';
import { Smartphone, X } from 'lucide-react';
import { useAndroidInstallable, useInstallPrompt, useIosInstallable } from '@/lib/pwa';
import IosInstallModal from '@/components/IosInstallModal';
import AndroidInstallModal from './AndroidInstallModal';

// Hasta cuándo está oculto el aviso después de tocar la ✕ (fecha en milisegundos)
const HIDE_KEY = 'dyl_mis_turnos_instalar_oculto_hasta';
// Antes el aviso se ocultaba para siempre con esta clave: ya no se usa
const OLD_HIDE_KEY = 'dyl_mis_turnos_sin_instalar';
// Se instaló desde este navegador (Android avisa con `appinstalled`)
const INSTALLED_KEY = 'dyl_mis_turnos_instalada';
const HIDE_DAYS = 7;

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // sin almacenamiento el aviso vuelve a aparecer la próxima vez
  }
}

// Invita a dejar Mis turnos como app en la pantalla de inicio.
// - Android: si Chrome ofrece su aviso, el botón lo abre; si no, muestra los pasos a mano.
// - iPhone: muestra los pasos de Safari.
// variant "row": fila chica dentro de Mis turnos, se puede cerrar y vuelve a la semana.
// variant "login": tarjeta en la pantalla de ingreso, siempre visible mientras no esté instalada.
export default function InstallBanner({ variant = 'row' }: { variant?: 'row' | 'login' }) {
  const installApp = useInstallPrompt();
  const ios = useIosInstallable();
  const android = useAndroidInstallable();
  const [hidden, setHidden] = useState(true);
  const [installed, setInstalled] = useState(false);
  const [modal, setModal] = useState<'ios' | 'android' | null>(null);

  useEffect(() => {
    try {
      localStorage.removeItem(OLD_HIDE_KEY);
    } catch {
      // nada que borrar
    }
    setHidden(readNumber(HIDE_KEY) > Date.now());
    setInstalled(readNumber(INSTALLED_KEY) > 0);
    const onInstalled = () => {
      write(INSTALLED_KEY, String(Date.now()));
      setInstalled(true);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => window.removeEventListener('appinstalled', onInstalled);
  }, []);

  // Chrome volvió a ofrecer instalar: la app ya no está en el celular
  useEffect(() => {
    if (installApp) setInstalled(false);
  }, [installApp]);

  const canInstall = !!installApp || ios || (android && !installed);
  if (!canInstall || (variant === 'row' && hidden)) return null;

  const onInstall = () => {
    if (installApp) installApp();
    else setModal(ios ? 'ios' : 'android');
  };

  const dismiss = () => {
    setHidden(true);
    write(HIDE_KEY, String(Date.now() + HIDE_DAYS * 24 * 60 * 60 * 1000));
  };

  const modals = (
    <>
      {modal === 'ios' && (
        <IosInstallModal
          appName="Mis turnos"
          note="La primera vez que abras la app instalada, ingresa de nuevo con tu RUT y tu clave."
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'android' && <AndroidInstallModal onClose={() => setModal(null)} />}
    </>
  );

  if (variant === 'login') {
    return (
      <>
        <div className="flex items-center gap-3 rounded-[14px] border border-blue-100 bg-blue-50 px-3.5 py-3">
          <span className="w-10 h-10 rounded-xl bg-blue-700 text-white flex items-center justify-center shrink-0">
            <Smartphone size={20} aria-hidden="true" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-gray-900 leading-snug">
              Instala Mis turnos en tu celular
            </p>
            <p className="text-[12px] text-gray-600 leading-snug">
              Queda como app y la abres con un toque.
            </p>
          </div>
          <button
            type="button"
            onClick={onInstall}
            className="h-9 px-3.5 rounded-lg bg-blue-700 text-white text-[14px] font-bold shrink-0"
          >
            Instalar
          </button>
        </div>
        {modals}
      </>
    );
  }

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
          onClick={onInstall}
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
      {modals}
    </>
  );
}

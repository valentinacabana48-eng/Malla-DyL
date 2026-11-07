'use client';
import React, { useEffect, useState } from 'react';
import { BellRing, BellOff, X } from 'lucide-react';
import { useAvisosCelular } from '@/lib/misTurnosVivo';

const HIDE_KEY = 'dyl_mis_turnos_avisos_no';

function leerOculto(): boolean {
  try {
    return localStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
}

// Invita a activar los avisos al celular cuando cambia un turno. En iPhone solo funciona con
// la app instalada (ahí ya aparece la invitación a instalarla), así que no se muestra.
export default function AvisosBanner({ token }: { token: string }) {
  const { estado, error, activar, desactivar } = useAvisosCelular(token);
  const [oculto, setOculto] = useState(true);
  const [activando, setActivando] = useState(false);

  useEffect(() => setOculto(leerOculto()), []);

  if (estado === 'activo') {
    return (
      <div className="flex items-center justify-between gap-2 px-1 text-[13px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <BellRing size={14} className="text-emerald-600" aria-hidden="true" />
          Te avisaremos al celular si cambia tu turno.
        </span>
        <button type="button" onClick={desactivar} className="underline shrink-0">
          Desactivar
        </button>
      </div>
    );
  }

  if (oculto || (estado !== 'apagado' && estado !== 'bloqueado')) return null;

  const cerrar = () => {
    setOculto(true);
    try {
      localStorage.setItem(HIDE_KEY, '1');
    } catch {
      // vuelve a aparecer la próxima vez
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm px-4 py-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
        {estado === 'bloqueado' ? (
          <BellOff size={20} className="text-amber-700" />
        ) : (
          <BellRing size={20} className="text-amber-700" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-gray-900">Avísame si cambia mi turno</p>
        <p className="text-[13px] text-gray-600 leading-snug">
          {estado === 'bloqueado'
            ? 'Los avisos están bloqueados. Actívalos en los ajustes del navegador o del celular para esta página.'
            : 'Te llega una notificación al celular cuando publiquen o cambien tus turnos.'}
        </p>
        {error && <p className="text-[13px] font-semibold text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {estado === 'apagado' && (
          <button
            type="button"
            disabled={activando}
            onClick={async () => {
              setActivando(true);
              await activar();
              setActivando(false);
            }}
            className="h-10 px-3.5 rounded-[10px] bg-amber-500 text-white text-sm font-bold disabled:opacity-60"
          >
            {activando ? 'Activando...' : 'Activar'}
          </button>
        )}
        <button
          type="button"
          onClick={cerrar}
          className="h-7 px-1 text-xs text-gray-500 flex items-center gap-1"
        >
          <X size={12} />
          Ahora no
        </button>
      </div>
    </div>
  );
}

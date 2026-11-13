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
    // Fila compacta: va dentro de la franja de avisos de Mis turnos
    <div className="px-3 py-2 flex items-center gap-2.5">
      {estado === 'bloqueado' ? (
        <BellOff size={17} className="text-amber-700 shrink-0" aria-hidden="true" />
      ) : (
        <BellRing size={17} className="text-amber-700 shrink-0" aria-hidden="true" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-gray-700 leading-snug">
          {estado === 'bloqueado'
            ? 'Avisos bloqueados: actívalos en los ajustes del celular'
            : 'Avísame si cambia mi turno'}
        </p>
        {error && <p className="text-[12px] font-semibold text-red-600">{error}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {estado === 'apagado' && (
          <button
            type="button"
            disabled={activando}
            onClick={async () => {
              setActivando(true);
              await activar();
              setActivando(false);
            }}
            className="h-8 px-3 rounded-lg bg-amber-500 text-white text-[13px] font-bold disabled:opacity-60"
          >
            {activando ? 'Activando...' : 'Activar'}
          </button>
        )}
        <button
          type="button"
          onClick={cerrar}
          aria-label="Ahora no"
          className="w-8 h-8 -mr-1 text-gray-400 flex items-center justify-center"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

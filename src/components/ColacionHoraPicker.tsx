'use client';
import React, { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';
import {
  type Worker,
  useAppContext,
  esHoraColacion,
  fechaDeDia,
  horaFijaColacion,
} from '@/context/AppContext';

/**
 * Elegir a qué hora sale a colación una persona un día (en la casilla de la malla).
 * Si su área tiene una hora fija para ese turno, aparece de partida.
 */
export default function ColacionHoraPicker({
  worker,
  monthKey,
  dayIndex,
  turno,
  diasMismoTurno,
  size = 'sm',
  onDone,
}: {
  worker: Pick<Worker, 'id' | 'area' | 'sucursal'>;
  monthKey: string;
  dayIndex: number;
  turno: string;
  /** Días del mes (índices) en que tiene este mismo turno, para "todos sus días" */
  diasMismoTurno: number[];
  /** 'sm' = menú de la casilla en el computador · 'lg' = panel del celular */
  size?: 'sm' | 'lg';
  onDone?: () => void;
}) {
  const { shifts, areaColacionHoras, getColacionHora, setColacionDias } = useAppContext();
  const shift = shifts[turno];
  const fecha = fechaDeDia(monthKey, dayIndex);
  const actual = getColacionHora(worker, fecha, turno);
  const fija = horaFijaColacion(areaColacionHoras, worker.area, worker.sucursal, turno);
  const [hora, setHora] = useState(actual?.hora ?? '');
  useEffect(() => setHora(actual?.hora ?? ''), [actual?.hora]);

  if (!shift || !(shift.colacion > 0)) return null;

  const guardar = async (dias: number[], h: string | null) => {
    const ok = await setColacionDias(
      dias.map((di) => ({ workerId: worker.id, fecha: fechaDeDia(monthKey, di), turno, hora: h }))
    );
    if (ok) onDone?.();
  };

  const valida = esHoraColacion(hora);
  const cambio = valida && hora !== actual?.hora;
  const otrosDias = diasMismoTurno.filter((d) => d !== dayIndex).length;
  const lg = size === 'lg';
  const btn = lg
    ? 'w-full py-3 rounded-xl text-sm font-semibold'
    : 'w-full px-2 py-1.5 rounded-md text-xs font-semibold';

  return (
    <div className={lg ? 'space-y-2' : 'px-3 py-2 space-y-1.5 min-w-[220px]'}>
      <p
        className={`flex items-center gap-1.5 font-bold uppercase tracking-wider text-muted-foreground ${lg ? 'text-xs' : 'text-[10px]'}`}
      >
        <Coffee size={lg ? 14 : 11} />
        Hora de colación ({shift.colacion} min)
      </p>
      <div className="flex items-center gap-2">
        <input
          type="time"
          step={900}
          value={hora}
          onChange={(e) => setHora(e.target.value)}
          aria-label="Hora de colación"
          className={`border border-border rounded-lg bg-background text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-ring ${lg ? 'px-3 py-2.5 text-base flex-1' : 'px-2 py-1 text-xs flex-1'}`}
        />
      </div>
      <p className={`text-muted-foreground ${lg ? 'text-xs' : 'text-[10px]'}`}>
        {actual?.origen === 'dia'
          ? fija
            ? `Elegida para este día. La fija del área es ${fija}.`
            : 'Elegida para este día.'
          : fija
            ? `Hora fija del área ${worker.area || ''}.`
            : 'Sin hora fija en su área.'}
      </p>
      {cambio && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => guardar([dayIndex], hora)}
            className={`${btn} bg-secondary text-white hover:bg-blue-700`}
          >
            Guardar solo este día
          </button>
          {otrosDias > 0 && (
            <button
              type="button"
              onClick={() => guardar(diasMismoTurno, hora)}
              className={`${btn} border border-secondary text-secondary hover:bg-secondary/10`}
            >
              Guardar en sus {otrosDias + 1} días con este turno del mes
            </button>
          )}
        </div>
      )}
      {actual?.origen === 'dia' && (
        <button
          type="button"
          onClick={() => guardar([dayIndex], null)}
          className={`${btn} text-muted-foreground hover:bg-muted/60 ${lg ? 'border border-border' : ''}`}
        >
          {fija ? `Volver a la del área (${fija})` : 'Quitar la hora'}
        </button>
      )}
    </div>
  );
}

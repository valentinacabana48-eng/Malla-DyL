'use client';
import React, { useMemo, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import {
  bodegaLabel,
  pasilloLabel,
  sortPasillos,
  type Shift,
  type ShiftCode,
  type Worker,
} from '@/context/AppContext';

// Cuánta gente hay en cada pasillo (o bodega) a cada hora del día, como las cajas vacías.
// Cuenta igual que la tabla por hora del Dashboard: a las 13:00 está quien entró a las 13 o antes
// y sale después de las 13.

type Tipo = 'pasillo' | 'bodega';

const TIPOS: Record<
  Tipo,
  { titulo: string; plural: string; corto: string; label: (v: string) => string }
> = {
  pasillo: { titulo: 'Gente por pasillo', plural: 'pasillos', corto: 'P', label: pasilloLabel },
  bodega: { titulo: 'Gente por bodega', plural: 'bodegas', corto: 'B', label: bodegaLabel },
};

interface Props {
  tipo: Tipo;
  sucursal: string;
  /** Pasillos o bodegas de la sucursal (Ajustes) */
  lugares: string[];
  /** Trabajadoras ya filtradas (sucursal, área, cargo, activas) */
  workers: Worker[];
  monthSched: Record<string, ShiftCode[]>;
  shifts: Record<string, Shift>;
  dayIndex: number;
}

const slotHour = (time: string) => parseInt(time.split(':')[0], 10);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const shortName = (name: string) => name.split(' ').slice(0, 2).join(' ');

export default function CoberturaLugares({
  tipo,
  sucursal,
  lugares,
  workers,
  monthSched,
  shifts,
  dayIndex,
}: Props) {
  const [picked, setPicked] = useState<{ hour: number; lugar: string } | null>(null);
  const { titulo, plural, corto, label } = TIPOS[tipo];

  // Quiénes trabajan hoy en un pasillo (o bodega) de esta sucursal, con su hora de entrada y salida
  const turnos = useMemo(() => {
    const list: {
      name: string;
      lugar: string;
      start: number;
      end: number;
      horario: string;
    }[] = [];
    workers.forEach((w) => {
      const lugar = w[tipo];
      if (w.sucursal !== sucursal || !lugar) return;
      const code = monthSched[w.id]?.[dayIndex];
      if (!code || code === 'DESC') return;
      const shift = shifts[code];
      if (!shift?.start || !shift?.end) return;
      const start = slotHour(shift.start);
      const end = slotHour(shift.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      list.push({
        name: w.name,
        lugar,
        start,
        end,
        horario: `${shift.start}–${shift.end}`,
      });
    });
    return list;
  }, [workers, tipo, sucursal, monthSched, shifts, dayIndex]);

  // Los de Ajustes y, por si acaso, los que tenga alguna trabajadora y no estén en la lista
  const columnas = useMemo(() => {
    const set = new Set(lugares);
    workers.forEach((w) => w.sucursal === sucursal && w[tipo] && set.add(w[tipo]!));
    return sortPasillos([...set]);
  }, [lugares, workers, tipo, sucursal]);

  const rows = useMemo(() => {
    if (turnos.length === 0) return [];
    const from = Math.min(...turnos.map((t) => t.start));
    const to = Math.max(...turnos.map((t) => t.end));
    const result = [];
    for (let h = from; h < to; h++) {
      const counts: Record<string, number> = {};
      columnas.forEach((p) => (counts[p] = 0));
      turnos.forEach((t) => {
        if (t.start <= h && t.end > h) counts[t.lugar] = (counts[t.lugar] ?? 0) + 1;
      });
      const vacios = columnas.filter((p) => counts[p] === 0).length;
      result.push({ hour: h, counts, vacios });
    }
    return result;
  }, [turnos, columnas]);

  if (columnas.length === 0) return null;

  const pickedNames = picked
    ? turnos
        .filter((t) => t.lugar === picked.lugar && t.start <= picked.hour && t.end > picked.hour)
        .map((t) => `${shortName(t.name)} (${t.horario})`)
    : [];

  const cellClass = (n: number) =>
    n === 0
      ? 'bg-orange-100 text-orange-600'
      : n === 1
        ? 'bg-blue-50 text-blue-600'
        : 'bg-blue-100 text-blue-700';

  return (
    <div
      className="mt-6 rounded-xl border border-border overflow-hidden"
      style={{ boxShadow: 'var(--shadow-sm)' }}
    >
      <div
        className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2"
        style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)' }}
      >
        <LayoutGrid size={15} className="text-secondary" />
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">{titulo}</h3>
        <span className="text-xs text-muted-foreground">· {sucursal}</span>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          Nadie con {tipo} trabaja este día.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card text-left px-3 py-2 text-xs font-bold text-muted-foreground uppercase tracking-wider border-b border-border">
                    Hora
                  </th>
                  <th className="px-2 py-2 text-xs font-bold text-orange-500 uppercase tracking-wider border-b border-border whitespace-nowrap">
                    Vacíos
                  </th>
                  {columnas.map((p) => (
                    <th
                      key={p}
                      title={label(p)}
                      className="px-1 py-2 text-[11px] font-bold text-muted-foreground border-b border-border whitespace-nowrap"
                    >
                      {/^\d+$/.test(p) ? `${corto}${p}` : p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.hour}>
                    <td className="sticky left-0 z-10 bg-card px-3 py-1 font-bold text-foreground font-tabular border-b border-border/50">
                      {hh(r.hour)}
                    </td>
                    <td className="px-2 py-1 text-center border-b border-border/50">
                      <span
                        className={`inline-flex items-center justify-center w-8 h-7 rounded-lg font-bold text-sm ${
                          r.vacios > 0
                            ? 'bg-orange-100 text-orange-600'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {r.vacios}
                      </span>
                    </td>
                    {columnas.map((p) => {
                      const n = r.counts[p];
                      const active = picked?.hour === r.hour && picked.lugar === p;
                      return (
                        <td key={p} className="px-0.5 py-1 text-center border-b border-border/50">
                          <button
                            type="button"
                            disabled={n === 0}
                            onClick={() => setPicked(active ? null : { hour: r.hour, lugar: p })}
                            aria-label={`${label(p)} a las ${hh(r.hour)}: ${n}`}
                            className={`w-8 h-7 rounded-md font-bold text-xs tabular-nums disabled:cursor-default ${cellClass(n)} ${
                              active ? 'ring-2 ring-blue-500' : ''
                            }`}
                          >
                            {n}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground space-y-1">
            {picked && (
              <p className="text-xs text-foreground">
                <span className="font-semibold">
                  {label(picked.lugar)} a las {hh(picked.hour)}:
                </span>{' '}
                {pickedNames.join(', ')}
              </p>
            )}
            <p>
              Cada número es cuánta gente hay en {tipo === 'bodega' ? 'esa bodega' : 'ese pasillo'}{' '}
              a esa hora; en naranja, {plural} sin nadie. Toca un número para ver quiénes son. No
              descuenta la colación.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

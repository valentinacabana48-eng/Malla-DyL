'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock } from 'lucide-react';
import {
  monthLabelToKey,
  type Shift,
  type ShiftCode,
  type Worker,
  timeToMinutes,
} from '@/context/AppContext';

// Cuántas personas quedan trabajando a cada hora de un día, según los turnos de la malla.
// Cada fila es la hora en punto; debajo se ve quién entra o sale dentro de esa hora.

interface Props {
  workers: Worker[];
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
  shifts: Record<string, Shift>;
  dayIndex: number;
  /** En el celular parte cerrada, mostrando solo el resumen */
  collapsible?: boolean;
  /** Va arriba, al lado del título (p. ej. el selector de día) */
  headerExtra?: React.ReactNode;
}

interface Turno {
  name: string;
  start: number;
  end: number;
}

const hhmm = (mins: number) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const OPEN_KEY = 'malla-cobertura-abierta';

const firstName = (name: string) => name.split(' ').slice(0, 2).join(' ');

export default function CoberturaHoras({
  workers,
  scheduleData,
  specialDaysData,
  shifts,
  dayIndex,
  collapsible = false,
  headerExtra,
}: Props) {
  // Cargo a contar: parte en Cajera si hay cajeras en la lista
  const cargos = useMemo(
    () => [...new Set(workers.map((w) => w.cargo).filter(Boolean))].sort(),
    [workers]
  );
  const [cargo, setCargo] = useState<string>('');
  useEffect(() => {
    if (cargo && !cargos.includes(cargo)) setCargo('');
  }, [cargos, cargo]);
  useEffect(() => {
    if (!cargo && cargos.includes('Cajera')) setCargo('Cajera');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargos]);

  // Abierto o cerrado: se recuerda en este equipo
  const [open, setOpenState] = useState(!collapsible);
  useEffect(() => {
    if (!collapsible) return;
    try {
      if (localStorage.getItem(OPEN_KEY) === '1') setOpenState(true);
    } catch {
      // sin almacenamiento: queda cerrado
    }
  }, [collapsible]);
  const setOpen = (fn: (v: boolean) => boolean) =>
    setOpenState((v) => {
      const next = fn(v);
      try {
        localStorage.setItem(OPEN_KEY, next ? '1' : '0');
      } catch {
        // sin almacenamiento: queda cerrado
      }
      return next;
    });
  const [openHour, setOpenHour] = useState<number | null>(null);

  const turnos = useMemo((): Turno[] => {
    const list: Turno[] = [];
    workers.forEach((w) => {
      if (cargo && w.cargo !== cargo) return;
      if (specialDaysData[w.id]?.[dayIndex]) return;
      const shift = shifts[scheduleData[w.id]?.[dayIndex] ?? ''];
      if (!shift?.start || !shift?.end) return;
      const start = timeToMinutes(shift.start);
      let end = timeToMinutes(shift.end);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return;
      if (end <= start) end += 1440; // turno que pasa la medianoche
      list.push({ name: w.name, start, end });
    });
    return list;
  }, [workers, scheduleData, specialDaysData, shifts, dayIndex, cargo]);

  const rows = useMemo(() => {
    if (turnos.length === 0) return [];
    const from = Math.floor(Math.min(...turnos.map((t) => t.start)) / 60);
    const to = Math.floor(Math.max(...turnos.map((t) => t.end)) / 60);
    const result = [];
    for (let h = from; h <= to; h++) {
      const at = h * 60;
      const present = turnos.filter((t) => t.start <= at && t.end > at).length;
      const entran = turnos
        .filter((t) => t.start >= at && t.start < at + 60)
        .sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));
      const salen = turnos
        .filter((t) => t.end >= at && t.end < at + 60)
        .sort((a, b) => a.end - b.end || a.name.localeCompare(b.name));
      result.push({ hour: h, present, entran, salen });
    }
    return result;
  }, [turnos]);

  const max = Math.max(1, ...rows.map((r) => r.present));
  const peak = rows.find((r) => r.present === max && max > 0);

  // Agrupa por hora: "21:30 salen 3"
  const byTime = (list: Turno[], key: 'start' | 'end') => {
    const map = new Map<number, string[]>();
    list.forEach((t) => map.set(t[key], [...(map.get(t[key]) ?? []), t.name]));
    return [...map.entries()];
  };

  const summary =
    rows.length === 0
      ? 'Nadie con turno este día.'
      : `Máximo ${max} a las ${hhmm(peak!.hour * 60)}. La última sale a las ${hhmm(
          Math.max(...turnos.map((t) => t.end))
        )}.`;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <Clock size={16} className="text-secondary" />
        <h2 className="text-sm font-bold text-foreground">
          {cargo === 'Cajera' ? 'Cajeras' : cargo ? cargo : 'Personas'} por hora
        </h2>
        {cargos.length > 1 && (
          <select
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            aria-label="Cargo"
            className="px-2 py-1 bg-background border border-border rounded-lg text-xs font-medium text-foreground"
          >
            <option value="">Todos los cargos</option>
            {cargos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2 ml-auto">{headerExtra}</div>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left text-sm text-muted-foreground"
          >
            <span>{summary}</span>
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {open &&
        (rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nadie con turno este día.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border/60">
              {rows.map((r) => {
                const changes = r.entran.length + r.salen.length > 0;
                const expanded = openHour === r.hour;
                return (
                  <div key={r.hour}>
                    <button
                      type="button"
                      disabled={!changes}
                      onClick={() => setOpenHour(expanded ? null : r.hour)}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left disabled:cursor-default hover:bg-muted/30 disabled:hover:bg-transparent"
                    >
                      <span className="w-12 shrink-0 text-sm font-bold text-foreground tabular-nums">
                        {hhmm(r.hour * 60)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="h-6 rounded-md bg-muted/50 overflow-hidden">
                          <div
                            className={`h-full rounded-md ${
                              r.present === max ? 'bg-blue-600' : 'bg-blue-400'
                            }`}
                            style={{ width: `${(r.present / max) * 100}%` }}
                          />
                        </div>
                        {changes && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                            {byTime(r.entran, 'start').map(([t, names]) => (
                              <span key={`e${t}`} className="mr-2 text-green-700">
                                {hhmm(t)} entran {names.length}
                              </span>
                            ))}
                            {byTime(r.salen, 'end').map(([t, names]) => (
                              <span key={`s${t}`} className="mr-2 text-red-600">
                                {hhmm(t)} salen {names.length}
                              </span>
                            ))}
                          </p>
                        )}
                      </div>
                      <span className="w-8 shrink-0 text-right text-lg font-bold text-foreground tabular-nums">
                        {r.present}
                      </span>
                      <span className="w-4 shrink-0 text-muted-foreground">
                        {changes &&
                          (expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-4 pb-3 pl-[4.75rem] space-y-1 text-xs">
                        {byTime(r.entran, 'start').map(([t, names]) => (
                          <p key={`ed${t}`} className="text-green-700">
                            <span className="font-semibold">Entran {hhmm(t)}:</span>{' '}
                            {names.map(firstName).join(', ')}
                          </p>
                        ))}
                        {byTime(r.salen, 'end').map(([t, names]) => (
                          <p key={`sd${t}`} className="text-red-600">
                            <span className="font-semibold">Salen {hhmm(t)}:</span>{' '}
                            {names.map(firstName).join(', ')}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
              El número es cuántas hay trabajando a esa hora en punto. Toca una hora para ver quién
              entra o sale. No descuenta la colación.
              {` Total del día: ${turnos.length}.`}
            </p>
          </>
        ))}
    </div>
  );
}

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Versión de escritorio: con su propio selector de día (parte en hoy si es de ese mes)
export function CoberturaHorasDia(
  props: Omit<Props, 'dayIndex' | 'headerExtra' | 'collapsible'> & {
    daysInMonth: number;
    monthLabel: string;
  }
) {
  const { daysInMonth, monthLabel, ...rest } = props;
  const [year, month] = monthLabelToKey(monthLabel).split('-').map(Number);
  const [dayIndex, setDayIndex] = useState(0);
  useEffect(() => {
    const now = new Date();
    const isThisMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    setDayIndex(isThisMonth ? now.getDate() - 1 : 0);
  }, [year, month]);
  return (
    <CoberturaHoras
      {...rest}
      dayIndex={Math.min(dayIndex, daysInMonth - 1)}
      collapsible
      headerExtra={
        <select
          value={dayIndex}
          onChange={(e) => setDayIndex(Number(e.target.value))}
          aria-label="Día"
          className="px-2 py-1 bg-background border border-border rounded-lg text-xs font-medium text-foreground"
        >
          {Array.from({ length: daysInMonth }, (_, i) => (
            <option key={i} value={i}>
              {DOW[new Date(year, month - 1, i + 1).getDay()]} {i + 1}
            </option>
          ))}
        </select>
      }
    />
  );
}

'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  useAppContext,
  monthLabelToKey,
  type Shift,
  type ShiftCode,
  type Worker,
} from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';

// Vista de la malla para celulares: un día a la vez (agrupado por turno) o el
// mes de una sola trabajadora. Tocar una fila abre un panel para cambiar el turno.

const DOW_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

interface MallaMobileProps {
  workers: Worker[];
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
  shifts: Record<string, Shift>;
  daysInMonth: number;
  monthLabel: string;
  holidayDayIndices: Set<number>;
  isLocked: boolean;
  onCellChange: (workerId: string, dayIndex: number, shift: ShiftCode) => void;
  onSpecialDayChange: (workerId: string, dayIndex: number, typeCode: string | null) => void;
}

type Cell =
  | { kind: 'shift'; code: string; shift: Shift | undefined }
  | { kind: 'special'; code: string; label: string; icon: string; colorClass: string }
  | { kind: 'empty' };

function shiftTime(s: Shift | undefined) {
  return s?.start ? `${s.start}–${s.end}` : '';
}

export default function MallaMobile({
  workers,
  scheduleData,
  specialDaysData,
  shifts,
  daysInMonth,
  monthLabel,
  holidayDayIndices,
  isLocked,
  onCellChange,
  onSpecialDayChange,
}: MallaMobileProps) {
  const { getAllNonWorkingTypes } = useAppContext();
  const nonWorkingTypes = getAllNonWorkingTypes();
  const isReadonly = useReadonly();
  const canEdit = !isLocked && !isReadonly;

  const [year, month] = monthLabelToKey(monthLabel).split('-').map(Number);

  const [view, setView] = useState<'dia' | 'persona'>('dia');
  const [dayIndex, setDayIndex] = useState(0);
  const [workerId, setWorkerId] = useState('');
  const [editing, setEditing] = useState<{ workerId: string; dayIndex: number } | null>(null);

  // Al cambiar de mes se abre hoy (si es de ese mes) o el día 1
  useEffect(() => {
    const now = new Date();
    const isThisMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    setDayIndex(isThisMonth ? now.getDate() - 1 : 0);
  }, [year, month]);

  useEffect(() => {
    if (!workers.some((w) => w.id === workerId)) setWorkerId(workers[0]?.id ?? '');
  }, [workers, workerId]);

  const getCell = (wid: string, di: number): Cell => {
    const special = specialDaysData[wid]?.[di];
    if (special) {
      const t = nonWorkingTypes.find((n) => n.code === special);
      return {
        kind: 'special',
        code: special,
        label: t?.label ?? special,
        icon: t?.icon ?? '📌',
        colorClass: t?.colorClass ?? 'bg-slate-100 text-slate-700 border border-slate-300',
      };
    }
    const code = scheduleData[wid]?.[di];
    if (!code) return { kind: 'empty' };
    return { kind: 'shift', code, shift: shifts[code] };
  };

  const dayTitle = (di: number) => {
    const d = new Date(year, month - 1, di + 1);
    return `${DOW_NAMES[d.getDay()]} ${di + 1} de ${MONTH_NAMES[month - 1]}`;
  };

  // Día: grupos por turno (ordenados por hora) y al final libres / permisos / sin turno
  const dayGroups = useMemo(() => {
    const byShift = new Map<string, Worker[]>();
    const off: { worker: Worker; cell: Cell }[] = [];
    workers.forEach((w) => {
      const cell = getCell(w.id, dayIndex);
      if (cell.kind === 'shift' && cell.shift?.start) {
        byShift.set(cell.code, [...(byShift.get(cell.code) ?? []), w]);
      } else {
        off.push({ worker: w, cell });
      }
    });
    const shiftGroups = [...byShift.entries()]
      .map(([code, list]) => ({ code, shift: shifts[code], list }))
      .sort((a, b) => (a.shift?.start ?? '').localeCompare(b.shift?.start ?? ''));
    return { shiftGroups, off };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, dayIndex, scheduleData, specialDaysData, shifts]);

  const editingWorker = editing ? workers.find((w) => w.id === editing.workerId) : undefined;
  const editingCell = editing ? getCell(editing.workerId, editing.dayIndex) : null;

  const selectShift = (code: string) => {
    if (!editing) return;
    if (editingCell?.kind === 'special')
      onSpecialDayChange(editing.workerId, editing.dayIndex, null);
    onCellChange(editing.workerId, editing.dayIndex, code);
    setEditing(null);
  };

  const selectSpecial = (code: string | null) => {
    if (!editing) return;
    onSpecialDayChange(editing.workerId, editing.dayIndex, code);
    setEditing(null);
  };

  const clearCell = () => {
    if (!editing) return;
    if (editingCell?.kind === 'special')
      onSpecialDayChange(editing.workerId, editing.dayIndex, null);
    else onCellChange(editing.workerId, editing.dayIndex, null);
    setEditing(null);
  };

  const rowClass =
    'w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left border-b border-border/60 last:border-b-0';

  const cellBadge = (cell: Cell) => {
    if (cell.kind === 'special')
      return (
        <span className={`text-sm font-semibold rounded-lg px-2 py-1 ${cell.colorClass}`}>
          {cell.icon} {cell.label}
        </span>
      );
    if (cell.kind === 'shift')
      return (
        <span
          className={`text-sm font-semibold rounded-lg px-2 py-1 ${cell.shift?.colorClass ?? ''}`}
        >
          {cell.shift?.start ? shiftTime(cell.shift) : cell.shift?.label || cell.code}
        </span>
      );
    return <span className="text-sm text-muted-foreground">Sin turno</span>;
  };

  const sortedShifts = Object.values(shifts).sort((a, b) =>
    (a.start || '99').localeCompare(b.start || '99')
  );

  return (
    <div className="space-y-4">
      {/* Selector de vista */}
      <div
        role="group"
        aria-label="Tipo de vista"
        className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-xl"
      >
        {(
          [
            ['dia', 'Por día'],
            ['persona', 'Por persona'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            aria-pressed={view === key}
            className={`py-2.5 rounded-lg text-sm font-semibold ${
              view === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === 'dia' ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label="Día anterior"
              disabled={dayIndex === 0}
              onClick={() => setDayIndex((d) => Math.max(0, d - 1))}
              className="w-11 h-11 flex items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="text-center">
              <p className="text-base font-bold text-foreground">{dayTitle(dayIndex)}</p>
              {holidayDayIndices.has(dayIndex) && (
                <p className="text-xs font-semibold text-red-600">Feriado</p>
              )}
            </div>
            <button
              type="button"
              aria-label="Día siguiente"
              disabled={dayIndex >= daysInMonth - 1}
              onClick={() => setDayIndex((d) => Math.min(daysInMonth - 1, d + 1))}
              className="w-11 h-11 flex items-center justify-center rounded-xl border border-border bg-card disabled:opacity-40"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {workers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay trabajadoras con estos filtros.
            </p>
          )}

          {dayGroups.shiftGroups.map(({ code, shift, list }) => (
            <section key={code} className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">
                  Turno {shiftTime(shift) || shift?.label || code}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {list.length} persona{list.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                {list.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEditing({ workerId: w.id, dayIndex })}
                    className={rowClass}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-foreground truncate">{w.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{w.cargo || w.role}</p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {shiftTime(shift)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {dayGroups.off.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-foreground">Libres, permisos y sin turno</h2>
                <span className="text-xs text-muted-foreground">
                  {dayGroups.off.length} persona{dayGroups.off.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                {dayGroups.off.map(({ worker: w, cell }) => (
                  <button
                    key={w.id}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEditing({ workerId: w.id, dayIndex })}
                    className={rowClass}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-foreground truncate">{w.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{w.cargo || w.role}</p>
                    </div>
                    {cellBadge(cell)}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-sm font-semibold text-foreground">Trabajadora</span>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="mt-1 w-full px-3 py-3 text-base border border-border rounded-xl bg-card text-foreground"
            >
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          {workerId && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              {Array.from({ length: daysInMonth }, (_, di) => {
                const d = new Date(year, month - 1, di + 1);
                const isSunday = d.getDay() === 0;
                return (
                  <button
                    key={di}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => setEditing({ workerId, dayIndex: di })}
                    className={`${rowClass} ${isSunday ? 'bg-muted/40' : ''}`}
                  >
                    <div className="w-12 shrink-0 text-center">
                      <p className="text-xs text-muted-foreground">
                        {DOW_NAMES[d.getDay()].slice(0, 3)}
                      </p>
                      <p className="text-lg font-bold text-foreground leading-tight">{di + 1}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      {holidayDayIndices.has(di) && (
                        <p className="text-xs font-semibold text-red-600">Feriado</p>
                      )}
                    </div>
                    {cellBadge(getCell(workerId, di))}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Panel para cambiar el turno de una trabajadora en un día */}
      {editing && editingWorker && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setEditing(null)} />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto bg-card rounded-t-3xl px-4 pt-3 pb-6 shadow-2xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-foreground">{editingWorker.name}</h2>
                <p className="text-sm text-muted-foreground">{dayTitle(editing.dayIndex)}</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setEditing(null)}
                className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground"
              >
                <X size={20} />
              </button>
            </div>

            <p className="mt-4 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Turnos
            </p>
            <div className="grid grid-cols-2 gap-2">
              {sortedShifts.map((s) => {
                const active = editingCell?.kind === 'shift' && editingCell.code === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => selectShift(s.code)}
                    aria-pressed={active}
                    className={`min-h-[52px] px-3 rounded-xl text-left ${s.colorClass} ${
                      active ? 'ring-2 ring-offset-1 ring-blue-600' : ''
                    }`}
                  >
                    <span className="block text-sm font-bold">{shiftTime(s) || s.label}</span>
                    {s.colacion > 0 && (
                      <span className="block text-xs opacity-80">Colación {s.colacion} min</span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="mt-5 mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Días especiales
            </p>
            <div className="grid grid-cols-2 gap-2">
              {nonWorkingTypes
                .filter((t) => !t.legacy)
                .map((t) => {
                  const active = editingCell?.kind === 'special' && editingCell.code === t.code;
                  return (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => selectSpecial(t.code)}
                      aria-pressed={active}
                      className={`min-h-[48px] px-3 rounded-xl text-left text-sm font-semibold ${t.colorClass} ${
                        active ? 'ring-2 ring-offset-1 ring-blue-600' : ''
                      }`}
                    >
                      {t.icon} {t.label}
                    </button>
                  );
                })}
            </div>

            {editingCell?.kind !== 'empty' && (
              <button
                type="button"
                onClick={clearCell}
                className="mt-5 w-full py-3.5 rounded-xl border border-border text-base font-semibold text-foreground"
              >
                Dejar sin turno
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

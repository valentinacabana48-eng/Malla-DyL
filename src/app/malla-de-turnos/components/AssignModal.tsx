'use client';
import React, { useState, useMemo } from 'react';
import { X, PenLine, CheckSquare, Square, ChevronDown, ChevronRight, Search } from 'lucide-react';
import {
  type ShiftCode,
  type Shift,
  type Worker,
  useAppContext,
  monthLabelToKey,
} from '@/context/AppContext';

// ─── Helper: group shift codes by start hour ───────────────────────────────
function groupShiftsByHour(shifts: Record<string, Shift>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const noHour: string[] = [];

  Object.keys(shifts).forEach((code) => {
    const info = shifts[code];
    if (!info.start) {
      noHour.push(code);
      return;
    }
    const hour = info.start.split(':')[0];
    const label = `${parseInt(hour, 10)}:00`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(code);
  });

  const sorted = new Map([...groups.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])));
  if (noHour.length > 0) sorted.set('—', noHour);
  return sorted;
}

// ─── Mini shift strip for a worker ────────────────────────────────────────
function WorkerShiftPreview({
  worker,
  shifts,
  scheduleForWorker,
  daysInMonth,
  daysOfWeek,
}: {
  worker: Worker;
  shifts: Record<string, Shift>;
  scheduleForWorker: ShiftCode[];
  daysInMonth: number;
  daysOfWeek: string[];
}) {
  return (
    <div className="flex gap-px mt-1 flex-wrap">
      {Array.from({ length: daysInMonth }, (_, i) => {
        const code = scheduleForWorker[i] ?? null;
        const shift = code && code !== 'DESC' ? shifts[code] : null;
        const isDow = daysOfWeek[i];
        const isSun = isDow === 'D';
        if (!code) {
          return (
            <div
              key={`prev-${i}`}
              title={`Día ${i + 1}: Sin asignar`}
              className={`w-[7px] h-[7px] rounded-sm ${isSun ? 'bg-red-100' : 'bg-muted/40'}`}
            />
          );
        }
        if (code === 'DESC') {
          return (
            <div
              key={`prev-${i}`}
              title={`Día ${i + 1}: Descanso`}
              className="w-[7px] h-[7px] rounded-sm bg-slate-300"
            />
          );
        }
        if (shift) {
          // Extract a color from the shift's colorClass for the dot
          const bgMatch = shift.colorClass.match(/bg-(\w+)-(\d+)/);
          const dotClass = bgMatch ? `bg-${bgMatch[1]}-${bgMatch[2]}` : 'bg-blue-400';
          return (
            <div
              key={`prev-${i}`}
              title={`Día ${i + 1}: ${shift.label} (${shift.start}–${shift.end})`}
              className={`w-[7px] h-[7px] rounded-sm ${dotClass}`}
            />
          );
        }
        return <div key={`prev-${i}`} className="w-[7px] h-[7px] rounded-sm bg-muted/40" />;
      })}
    </div>
  );
}

interface Props {
  workers: Worker[];
  shifts: Record<string, Shift>;
  daysOfWeek: string[];
  onAssign: (workerIds: string[], dayIndices: number[], shift: ShiftCode) => void;
  onAssignSpecialDay: (workerIds: string[], dayIndices: number[], typeCode: string | null) => void;
  onClose: () => void;
}

type AssignMode = 'turno' | 'especial';

export default function AssignModal({
  workers,
  shifts,
  daysOfWeek,
  onAssign,
  onAssignSpecialDay,
  onClose,
}: Props) {
  const { getAllNonWorkingTypes, scheduleData, selectedMes, areas } = useAppContext();
  const nonWorkingTypes = getAllNonWorkingTypes();

  const daysInMonth = daysOfWeek.filter((d) => d !== '').length || 31;
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const shiftCodes = Object.keys(shifts) as string[];
  const [mode, setMode] = useState<AssignMode>('turno');
  const [selectedShift, setSelectedShift] = useState<ShiftCode>(shiftCodes[0] || null);
  const [selectedSpecialType, setSelectedSpecialType] = useState<string>(
    nonWorkingTypes[0]?.code || ''
  );
  // Start with NO days selected (not day 1)
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([]);
  const [expandedHour, setExpandedHour] = useState<string | null>(null);

  // Worker search & area filter
  const [workerSearch, setWorkerSearch] = useState('');
  const [workerAreaFilter, setWorkerAreaFilter] = useState('Todas');

  const areaOptions = useMemo(() => ['Todas', ...areas], [areas]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (workerAreaFilter !== 'Todas' && w.area !== workerAreaFilter) return false;
      if (workerSearch.trim()) {
        const q = workerSearch.trim().toLowerCase();
        if (!w.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [workers, workerSearch, workerAreaFilter]);

  // Get current month schedule for preview
  const currentMonthSchedule = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    return scheduleData[monthKey] || {};
  }, [scheduleData, selectedMes]);

  const shiftGroups = groupShiftsByHour(shifts);

  const toggleWorker = (id: string) => {
    setSelectedWorkers((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const toggleAllWorkers = () => {
    const visibleIds = filteredWorkers.map((w) => w.id);
    const allVisibleSelected = visibleIds.every((id) => selectedWorkers.includes(id));
    if (allVisibleSelected) {
      setSelectedWorkers((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedWorkers((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const toggleDay = (dayIdx: number) => {
    setSelectedDays((prev) =>
      prev.includes(dayIdx) ? prev.filter((d) => d !== dayIdx) : [...prev, dayIdx]
    );
  };

  const handleSubmit = () => {
    if (selectedWorkers.length === 0 || selectedDays.length === 0) return;
    if (mode === 'turno') {
      if (!selectedShift) return;
      onAssign(selectedWorkers, selectedDays, selectedShift);
    } else {
      onAssignSpecialDay(selectedWorkers, selectedDays, selectedSpecialType);
    }
  };

  const visibleIds = filteredWorkers.map((w) => w.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedWorkers.includes(id));
  const canSubmit =
    selectedWorkers.length > 0 &&
    selectedDays.length > 0 &&
    (mode === 'turno' ? !!selectedShift : !!selectedSpecialType);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <PenLine size={18} className="text-secondary" />
            <h2 className="text-base font-bold text-foreground">Asignar en Bloque</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Mode toggle */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Tipo de asignación
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('turno')}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${mode === 'turno' ? 'bg-secondary text-white border-secondary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
              >
                🕐 Turno de trabajo
              </button>
              <button
                onClick={() => setMode('especial')}
                className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${mode === 'especial' ? 'bg-secondary text-white border-secondary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
              >
                📋 Día especial (no trabaja)
              </button>
            </div>
          </div>

          {/* Shift or special type selector */}
          {mode === 'turno' ? (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Turno a asignar
              </label>
              {shiftCodes.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">
                  No hay turnos configurados. Ve a Ajustes para agregar turnos.
                </p>
              ) : (
                <div className="space-y-1">
                  {[...shiftGroups.entries()].map(([hourLabel, codes]) => {
                    const isExpanded = expandedHour === hourLabel;

                    if (codes.length === 1) {
                      const s = codes[0];
                      const info = shifts[s];
                      return (
                        <button
                          key={`modal-shift-${s}`}
                          onClick={() => setSelectedShift(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
                            selectedShift === s
                              ? `${info.colorClass} ring-2 ring-offset-1 ring-current`
                              : 'border-border text-muted-foreground hover:bg-muted/50'
                          }`}
                        >
                          {s === 'DESC'
                            ? 'DESCANSO'
                            : `${info.label.toUpperCase()} (${info.start}–${info.end})`}
                        </button>
                      );
                    }

                    const anySelected = codes.some((c) => c === selectedShift);
                    return (
                      <div
                        key={`modal-grp-${hourLabel}`}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedHour(isExpanded ? null : hourLabel)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold transition-colors ${anySelected ? 'bg-secondary/10 text-secondary' : 'hover:bg-muted/40 text-muted-foreground'}`}
                        >
                          <span>
                            🕐 Turno {hourLabel}{' '}
                            <span className="font-normal opacity-70">
                              ({codes.length} opciones)
                            </span>
                          </span>
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                        {isExpanded && (
                          <div className="flex flex-wrap gap-2 p-2 bg-muted/20 border-t border-border">
                            {codes.map((s) => {
                              const info = shifts[s];
                              return (
                                <button
                                  key={`modal-shift-${s}`}
                                  onClick={() => setSelectedShift(s)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 ${
                                    selectedShift === s
                                      ? `${info.colorClass} ring-2 ring-offset-1 ring-current`
                                      : 'border-border text-muted-foreground hover:bg-muted/50'
                                  }`}
                                >
                                  {s === 'DESC'
                                    ? 'DESCANSO'
                                    : `${info.label.toUpperCase()} (${info.start}–${info.end})`}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Tipo de día especial
              </label>
              <div className="flex flex-wrap gap-2">
                {nonWorkingTypes
                  .filter((t) => !t.legacy)
                  .map((nwt) => (
                    <button
                      key={`modal-nwt-${nwt.code}`}
                      onClick={() => setSelectedSpecialType(nwt.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all duration-150 flex items-center gap-1.5 ${
                        selectedSpecialType === nwt.code
                          ? `${nwt.colorClass} ring-2 ring-offset-1 ring-current`
                          : 'border-border text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span>{nwt.icon}</span>
                      {nwt.label.toUpperCase()}
                      {nwt.maxDaysPerMonth !== null && (
                        <span className="opacity-60 font-normal">
                          (máx. {nwt.maxDaysPerMonth}/mes)
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Day selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Días del mes ({selectedDays.length} seleccionados)
              </label>
              <button
                onClick={() => {
                  if (selectedDays.length === daysInMonth) {
                    setSelectedDays([]);
                  } else {
                    setSelectedDays(Array.from({ length: daysInMonth }, (_, i) => i));
                  }
                }}
                className="text-xs font-semibold text-secondary hover:text-blue-700 transition-colors"
              >
                {selectedDays.length === daysInMonth ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d, i) => {
                const dow = daysOfWeek[i];
                const isSunday = dow === 'D';
                const isSelected = selectedDays.includes(i);
                return (
                  <button
                    key={`modal-day-${d}`}
                    onClick={() => toggleDay(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all duration-150 flex flex-col items-center justify-center leading-none ${
                      isSelected
                        ? 'bg-secondary text-white border-secondary'
                        : isSunday
                          ? 'border-red-200 text-red-500 hover:bg-red-50'
                          : 'border-border text-foreground hover:bg-muted/50'
                    }`}
                    title={`Día ${d} (${dow})`}
                  >
                    <span>{d}</span>
                    <span className="text-[8px] opacity-70">{dow}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Worker selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Colaboradoras ({selectedWorkers.length}/{workers.length} seleccionadas)
              </label>
              <button
                onClick={toggleAllWorkers}
                className="flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-blue-700 transition-colors"
              >
                {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                {allVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar visibles'}
              </button>
            </div>

            {/* Search + area filter */}
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Buscar por nombre..."
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-input border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="relative min-w-[130px]">
                <select
                  value={workerAreaFilter}
                  onChange={(e) => setWorkerAreaFilter(e.target.value)}
                  className="w-full pl-2 pr-7 py-1.5 bg-input border border-border rounded-lg text-xs text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {areaOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>

            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {filteredWorkers.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2 text-center">
                  No se encontraron colaboradoras
                </p>
              )}
              {filteredWorkers.map((w) => {
                const isSelected = selectedWorkers.includes(w.id);
                const workerSched = currentMonthSchedule[w.id] || Array(31).fill(null);
                return (
                  <button
                    key={`modal-worker-${w.id}`}
                    onClick={() => toggleWorker(w.id)}
                    className={`flex flex-col w-full px-3 py-2 rounded-lg text-xs border transition-all ${
                      isSelected
                        ? 'bg-secondary/10 border-secondary text-secondary'
                        : 'border-border text-foreground hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                      <span className="font-semibold truncate">{w.name}</span>
                      <span className="text-[10px] opacity-60 ml-auto shrink-0">{w.area}</span>
                    </div>
                    {/* Mini shift preview */}
                    <WorkerShiftPreview
                      worker={w}
                      shifts={shifts}
                      scheduleForWorker={workerSched}
                      daysInMonth={daysInMonth}
                      daysOfWeek={daysOfWeek}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {selectedWorkers.length} colaboradora{selectedWorkers.length !== 1 ? 's' : ''} ·{' '}
            {selectedDays.length} día{selectedDays.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 bg-secondary text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <PenLine size={14} />
              Asignar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

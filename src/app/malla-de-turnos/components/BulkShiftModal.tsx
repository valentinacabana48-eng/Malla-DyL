'use client';
import React, { useState, useMemo } from 'react';
import { X, CheckSquare, Square, Search, Zap } from 'lucide-react';
import {
  type ShiftCode,
  type Shift,
  type Worker,
  useAppContext,
  monthLabelToKey,
} from '@/context/AppContext';

interface Props {
  workers: Worker[];
  shifts: Record<string, Shift>;
  onAssign: (workerIds: string[], dayIndices: number[], shift: ShiftCode) => void;
  onClose: () => void;
}

export default function BulkShiftModal({ workers, shifts, onAssign, onClose }: Props) {
  const { scheduleData, specialDays, selectedMes, areas } = useAppContext();
  const [selectedShift, setSelectedShift] = useState<ShiftCode>(Object.keys(shifts)[0] || null);
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>(workers.map((w) => w.id));
  const [workerSearch, setWorkerSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [applyMode, setApplyMode] = useState<'all' | 'empty'>('empty');

  const areaOptions = useMemo(() => ['Todas', ...areas], [areas]);

  const currentMonthSchedule = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    return scheduleData[monthKey] || {};
  }, [scheduleData, selectedMes]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (areaFilter !== 'Todas' && w.area !== areaFilter) return false;
      if (workerSearch.trim()) {
        const q = workerSearch.trim().toLowerCase();
        if (!w.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [workers, workerSearch, areaFilter]);

  const toggleWorker = (id: string) => {
    setSelectedWorkers((prev) =>
      prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    const visibleIds = filteredWorkers.map((w) => w.id);
    const allSelected = visibleIds.every((id) => selectedWorkers.includes(id));
    if (allSelected) {
      setSelectedWorkers((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedWorkers((prev) => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const handleAssign = () => {
    if (!selectedShift || selectedWorkers.length === 0) return;
    const daysInMonth = new Date(
      parseInt(selectedMes.split(' ')[1] || '2026', 10),
      [
        'Enero',
        'Febrero',
        'Marzo',
        'Abril',
        'Mayo',
        'Junio',
        'Julio',
        'Agosto',
        'Septiembre',
        'Octubre',
        'Noviembre',
        'Diciembre',
      ].indexOf(selectedMes.split(' ')[0]) + 1,
      0
    ).getDate();

    const monthKey = monthLabelToKey(selectedMes);
    const currentSpecialDays = specialDays[monthKey] || {};

    let dayIndices: number[];
    if (applyMode === 'all') {
      // Skip days where ALL selected workers already have a special day
      dayIndices = [];
      for (let i = 0; i < daysInMonth; i++) {
        const allHaveSpecial = selectedWorkers.every((wId) => {
          const workerSpecial = currentSpecialDays[wId] || {};
          return !!workerSpecial[i];
        });
        if (!allHaveSpecial) dayIndices.push(i);
      }
    } else {
      // Only empty days: no shift AND no special day
      dayIndices = [];
      for (let i = 0; i < daysInMonth; i++) {
        const anyEmpty = selectedWorkers.some((wId) => {
          const sched = currentMonthSchedule[wId] || [];
          const workerSpecial = currentSpecialDays[wId] || {};
          return !sched[i] && !workerSpecial[i];
        });
        if (anyEmpty) dayIndices.push(i);
      }
    }

    if (dayIndices.length === 0) return;
    onAssign(selectedWorkers, dayIndices, selectedShift);
  };

  const visibleIds = filteredWorkers.map((w) => w.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedWorkers.includes(id));
  const canSubmit = selectedShift && selectedWorkers.length > 0;

  const shiftList = Object.values(shifts).filter((s) => s.code !== 'DESC');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
              <Zap size={16} className="text-secondary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Asignación Masiva de Turno</h2>
              <p className="text-xs text-muted-foreground">
                Asigna un turno a múltiples trabajadoras a la vez
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Step 1: Select shift */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              1. Turno a asignar
            </label>
            <div className="flex flex-wrap gap-2">
              {shiftList.map((s) => (
                <button
                  key={`bs-${s.code}`}
                  onClick={() => setSelectedShift(s.code)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    selectedShift === s.code
                      ? `${s.colorClass} ring-2 ring-offset-1 ring-current`
                      : 'border-border text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {s.label} ({s.start}–{s.end})
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Apply mode */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              2. ¿Qué días rellenar?
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setApplyMode('empty')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  applyMode === 'empty'
                    ? 'bg-secondary text-white border-secondary'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                Solo días vacíos
              </button>
              <button
                onClick={() => setApplyMode('all')}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  applyMode === 'all'
                    ? 'bg-secondary text-white border-secondary'
                    : 'border-border text-muted-foreground hover:bg-muted/50'
                }`}
              >
                Todos los días del mes
              </button>
            </div>
            {applyMode === 'all' && (
              <p className="mt-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                ⚠️ Esto sobreescribirá todos los turnos existentes del mes para las trabajadoras
                seleccionadas.
              </p>
            )}
          </div>

          {/* Step 3: Select workers */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                3. Trabajadoras ({selectedWorkers.length} seleccionadas)
              </label>
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-xs text-secondary hover:text-blue-700 font-medium transition-colors"
              >
                {allVisibleSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                {allVisibleSelected ? 'Deseleccionar visibles' : 'Seleccionar todas'}
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Buscar trabajadora..."
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-secondary"
                />
              </div>
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="px-2 py-1.5 text-xs border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-secondary"
              >
                {areaOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            {/* Worker list */}
            <div className="border border-border rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              {filteredWorkers.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No hay trabajadoras que coincidan
                </div>
              ) : (
                filteredWorkers.map((w, idx) => {
                  const isSelected = selectedWorkers.includes(w.id);
                  return (
                    <button
                      key={`bw-${w.id}`}
                      onClick={() => toggleWorker(w.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-border/50 last:border-0 ${
                        isSelected ? 'bg-secondary/5' : 'hover:bg-muted/40'
                      } ${idx % 2 === 0 ? '' : ''}`}
                    >
                      <div
                        className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'bg-secondary border-secondary' : 'border-border'
                        }`}
                      >
                        {isSelected && <span className="text-white text-[9px] font-bold">✓</span>}
                      </div>
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ background: w.avatarColor || '#1d5bd4' }}
                      >
                        {w.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{w.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {w.cargo || w.role} · {w.area}
                        </p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {w.horasContratadas}h
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedWorkers.length} trabajadora{selectedWorkers.length !== 1 ? 's' : ''} · turno{' '}
            {selectedShift || '—'} · {applyMode === 'empty' ? 'días vacíos' : 'todo el mes'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAssign}
              disabled={!canSubmit}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-secondary text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              Asignar turno
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

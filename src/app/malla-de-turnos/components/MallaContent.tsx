'use client';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { CalendarDays, PenLine, FileSpreadsheet } from 'lucide-react';
import {
  useAppContext,
  getDaysOfWeekForMonth,
  getDaysInMonth,
  monthLabelToKey,
  getChileanHolidays,
  type ShiftCode,
} from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';
import { evaluateMonth, type MonthCompliance } from '@/lib/compliance';
import MallaFilters from './MallaFilters';
import MallaGrid from './MallaGrid';
import AssignModal from './AssignModal';
import MallaSummary from './MallaSummary';
import LockToggle from '@/components/LockToggle';
import { useSharedLock } from '@/hooks/useSharedLock';
import BulkShiftModal from './BulkShiftModal';
import MallaExcelPanel from './MallaExcelPanel';
import MallaDownloadModal from './MallaDownloadModal';

const DELETED_BIRTHDAYS_KEY = 'malla_deleted_birthdays';

// Helper: load/save manually-deleted birthday keys from localStorage
// Key format: "workerId|monthKey|dayIndex"
function loadDeletedBirthdays(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_BIRTHDAYS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveDeletedBirthdays(set: Set<string>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DELETED_BIRTHDAYS_KEY, JSON.stringify([...set]));
  } catch {
    // localStorage puede no estar disponible (modo privado); no es crítico
  }
}

export default function MallaContent() {
  const {
    workers,
    shifts,
    scheduleData,
    specialDays,
    setCellShift,
    bulkAssign,
    setSpecialDay,
    bulkAssignSpecialDay,
    selectedMes,
    setSelectedMes,
    getSucursalCajas,
    globalSucursal,
    globalArea,
  } = useAppContext();
  const isReadonly = useReadonly();

  const [selectedArea, setSelectedArea] = useState('Todas');
  const [selectedSucursal, setSelectedSucursal] = useState(globalSucursal);
  const [selectedTurno, setSelectedTurno] = useState('Todos');
  const [selectedCargo, setSelectedCargo] = useState('Todos');
  const [selectedHoras, setSelectedHoras] = useState<string[]>([]);
  const [nameSearch, setNameSearch] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkShiftModal, setShowBulkShiftModal] = useState(false);
  const [showExcelPanel, setShowExcelPanel] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [contractedHoursOverride, setContractedHoursOverride] = useState<Record<string, number>>(
    {}
  );

  // ─── Lock state (compartido entre dispositivos, solo admin lo cambia) ──────
  const lockSucursal = selectedSucursal && selectedSucursal !== 'Todas' ? selectedSucursal : null;
  const { isLocked, setLocked } = useSharedLock(
    lockSucursal ? `malla_locked:${lockSucursal}` : null
  );

  const handleToggleLock = async (locked: boolean) => {
    const ok = await setLocked(locked);
    if (ok) toast.success(locked ? '🔒 Malla bloqueada' : '🔓 Malla desbloqueada');
    return ok;
  };
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    setSelectedSucursal(globalSucursal);
  }, [globalSucursal]);

  React.useEffect(() => {
    if (globalArea && globalArea !== 'Todas') {
      setSelectedArea(globalArea);
    }
  }, [globalArea]);

  // ─── Refs for latest specialDays / scheduleData (avoid stale closure in effects) ─
  const specialDaysRef = React.useRef(specialDays);
  React.useEffect(() => {
    specialDaysRef.current = specialDays;
  }, [specialDays]);
  const scheduleDataRef = React.useRef(scheduleData);
  React.useEffect(() => {
    scheduleDataRef.current = scheduleData;
  }, [scheduleData]);

  // Track which month the birthday effect last ran so it only fires on month changes
  const birthdayEffectMonthRef = React.useRef<string | null>(null);

  // Ref to hold the in-memory set of manually-deleted birthday keys
  const deletedBirthdaysRef = React.useRef<Set<string>>(loadDeletedBirthdays());

  // ─── Auto-mark birthdays when month changes ───────────────────────────────
  useEffect(() => {
    // Only run when the month actually changes — NOT on every workers update
    if (birthdayEffectMonthRef.current === selectedMes) return;
    birthdayEffectMonthRef.current = selectedMes;

    const MONTH_NAMES_MAP: Record<string, number> = {
      Enero: 0,
      Febrero: 1,
      Marzo: 2,
      Abril: 3,
      Mayo: 4,
      Junio: 5,
      Julio: 6,
      Agosto: 7,
      Septiembre: 8,
      Octubre: 9,
      Noviembre: 10,
      Diciembre: 11,
    };
    const parts = (selectedMes || '').split(' ');
    const monthIdx = MONTH_NAMES_MAP[parts[0]];
    if (monthIdx === undefined) return;

    const monthKey = monthLabelToKey(selectedMes);
    // Use refs so we always read the latest data, not a stale closure snapshot
    const currentSpecialDays = specialDaysRef.current[monthKey] || {};
    const currentSchedule = scheduleDataRef.current[monthKey] || {};

    workers.forEach((worker) => {
      if (!worker.birthday) return;
      // birthday stored as YYYY-MM-DD
      const bDate = new Date(worker.birthday + 'T00:00:00');
      if (isNaN(bDate.getTime())) return;
      if (bDate.getMonth() !== monthIdx) return;

      const dayIndex = bDate.getDate() - 1; // 0-based
      const workerSpecialDays = currentSpecialDays[worker.id] || {};
      const workerSchedule = currentSchedule[worker.id] || [];

      // Skip if this birthday was manually deleted by the user
      const deletedKey = `${worker.id}|${monthKey}|${dayIndex}`;
      if (deletedBirthdaysRef.current.has(deletedKey)) return;

      // Only auto-mark if the cell doesn't already have a special day OR a shift assigned
      if (!workerSpecialDays[dayIndex] && !workerSchedule[dayIndex]) {
        setSpecialDay(worker.id, dayIndex, 'CUMPLEANOS');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMes, workers]);

  // ─── Compute holiday day indices for the current month (for header highlight) ─
  const holidayDayIndices = useMemo<Set<number>>(() => {
    const MONTH_NAMES_MAP: Record<string, number> = {
      Enero: 0,
      Febrero: 1,
      Marzo: 2,
      Abril: 3,
      Mayo: 4,
      Junio: 5,
      Julio: 6,
      Agosto: 7,
      Septiembre: 8,
      Octubre: 9,
      Noviembre: 10,
      Diciembre: 11,
    };
    const parts = (selectedMes || '').split(' ');
    const monthIdx = MONTH_NAMES_MAP[parts[0]];
    if (monthIdx === undefined) return new Set();
    const year = parseInt(parts[1] || '2026', 10);
    return new Set(getChileanHolidays(monthIdx, year));
  }, [selectedMes]);

  const daysOfWeek = useMemo(() => getDaysOfWeekForMonth(selectedMes), [selectedMes]);
  const daysInMonth = useMemo(() => getDaysInMonth(selectedMes), [selectedMes]);

  const currentMonthSchedule = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    return scheduleData[monthKey] || {};
  }, [scheduleData, selectedMes]);

  const currentMonthSpecialDays = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    return specialDays[monthKey] || {};
  }, [specialDays, selectedMes]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (w.estado !== 'Activo') return false;
      if (selectedArea !== 'Todas' && w.area !== selectedArea) return false;
      if (selectedSucursal !== 'Todas' && w.sucursal !== selectedSucursal) return false;
      if (selectedCargo !== 'Todos' && w.cargo !== selectedCargo) return false;
      // Contracted hours multi-select filter
      if (selectedHoras.length > 0) {
        const workerHrs = contractedHoursOverride[w.id] ?? w.horasContratadas ?? 42;
        const matchesAny = selectedHoras.some((h) => parseInt(h, 10) === workerHrs);
        if (!matchesAny) return false;
      }
      // Name search filter
      if (nameSearch.trim()) {
        const q = nameSearch.trim().toLowerCase();
        if (!w.name.toLowerCase().includes(q)) return false;
      }
      if (selectedTurno !== 'Todos') {
        const monthKey = monthLabelToKey(selectedMes);
        const sched = (scheduleData[monthKey] || {})[w.id] || [];
        const hasShift = sched.some((s) => {
          if (!s || s === 'DESC') return false;
          const shiftInfo = shifts[s];
          if (!shiftInfo) return false;
          const label = `${shiftInfo.label} (${shiftInfo.start} - ${shiftInfo.end})`;
          return label === selectedTurno;
        });
        if (!hasShift) return false;
      }
      return true;
    });
  }, [
    workers,
    selectedArea,
    selectedSucursal,
    selectedCargo,
    selectedTurno,
    selectedHoras,
    nameSearch,
    contractedHoursOverride,
    scheduleData,
    shifts,
    selectedMes,
  ]);

  // ── Reglas de cumplimiento (una sola fuente: src/lib/compliance.ts) ──
  const complianceByWorker = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    const [year, month] = monthKey.split('-').map(Number);
    const keyOf = (y: number, m: number) => {
      const date = new Date(y, m - 1, 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };
    const prevKey = keyOf(year, month - 1);
    const nextKey = keyOf(year, month + 1);
    const map = new Map<string, MonthCompliance>();
    filteredWorkers.forEach((w) => {
      map.set(
        w.id,
        evaluateMonth({
          year,
          monthIdx: month - 1,
          sched: currentMonthSchedule[w.id] || [],
          special: currentMonthSpecialDays[w.id] || {},
          prevSched: scheduleData[prevKey]?.[w.id],
          prevSpecial: specialDays[prevKey]?.[w.id],
          nextSched: scheduleData[nextKey]?.[w.id],
          nextSpecial: specialDays[nextKey]?.[w.id],
          shifts,
          weeklyHours: contractedHoursOverride[w.id] ?? w.horasContratadas ?? 42,
          exentoDomingos: w.exentoDomingos,
        })
      );
    });
    return map;
  }, [
    filteredWorkers,
    selectedMes,
    currentMonthSchedule,
    currentMonthSpecialDays,
    scheduleData,
    specialDays,
    shifts,
    contractedHoursOverride,
  ]);

  const getCompliance = (workerId: string): MonthCompliance | undefined =>
    complianceByWorker.get(workerId);

  const getAlerts = (workerId: string): string[] => getCompliance(workerId)?.alerts ?? [];

  // Semanas (por su primer día del mes) con menos horas de lo esperado
  const getWeekUnderHours = (workerId: string): Set<number> =>
    new Set((getCompliance(workerId)?.weeks ?? []).filter((w) => w.under).map((w) => w.startDay));

  const handleCellChange = async (workerId: string, dayIndex: number, shift: ShiftCode) => {
    if (isLocked) return;
    const ok = await setCellShift(workerId, dayIndex, shift);
    if (ok) toast.success('✓ Guardado', { duration: 1500 });
    else toast.error('Error al guardar. Intenta de nuevo.');
  };

  const handleImportCell = async (workerId: string, dayIndex: number, shift: ShiftCode) => {
    await setCellShift(workerId, dayIndex, shift);
  };

  const handleSpecialDayChange = (workerId: string, dayIndex: number, typeCode: string | null) => {
    if (isLocked) return;

    // If the user is clearing a birthday cell, remember it so auto-mark won't restore it
    if (typeCode === null) {
      const monthKey = monthLabelToKey(selectedMes);
      const currentSpecialDays = specialDaysRef.current[monthKey] || {};
      const workerSpecialDays = currentSpecialDays[workerId] || {};
      if (workerSpecialDays[dayIndex] === 'CUMPLEANOS') {
        const deletedKey = `${workerId}|${monthKey}|${dayIndex}`;
        deletedBirthdaysRef.current.add(deletedKey);
        saveDeletedBirthdays(deletedBirthdaysRef.current);
      }
    }

    setSpecialDay(workerId, dayIndex, typeCode);
  };

  const handleAssign = async (workerIds: string[], dayIndices: number[], shift: ShiftCode) => {
    if (isLocked) return;
    const ok = await bulkAssign(workerIds, dayIndices, shift);
    if (ok)
      toast.success(
        `✓ Turno ${shift} guardado para ${workerIds.length} trabajadora(s) en ${dayIndices.length} día(s)`,
        { duration: 2500 }
      );
    else toast.error('Error al guardar algunos turnos. Intenta de nuevo.');
    setShowAssignModal(false);
  };

  const handleAssignSpecialDay = (
    workerIds: string[],
    dayIndices: number[],
    typeCode: string | null
  ) => {
    if (isLocked) return;
    bulkAssignSpecialDay(workerIds, dayIndices, typeCode);
    const label = typeCode || 'vacío';
    toast.success(
      `Día especial "${label}" asignado a ${workerIds.length} trabajadora(s) en ${dayIndices.length} día(s)`
    );
    setShowAssignModal(false);
  };

  const handleContractedHoursChange = (workerId: string, hours: number) => {
    setContractedHoursOverride((prev) => ({ ...prev, [workerId]: hours }));
  };

  const handleBulkShiftAssign = async (
    workerIds: string[],
    dayIndices: number[],
    shift: ShiftCode
  ) => {
    if (isLocked) return;
    const ok = await bulkAssign(workerIds, dayIndices, shift);
    if (ok)
      toast.success(`✓ Turno ${shift} asignado a ${workerIds.length} trabajadora(s)`, {
        duration: 2500,
      });
    else toast.error('Error al guardar algunos turnos. Intenta de nuevo.');
    setShowBulkShiftModal(false);
  };

  const turnoOptions = useMemo(() => {
    const opts = ['Todos'];
    Object.values(shifts).forEach((s) => {
      if (s.code !== 'DESC' && s.start) {
        opts.push(`${s.label} (${s.start} - ${s.end})`);
      }
    });
    return opts;
  }, [shifts]);

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <CalendarDays size={20} className="text-secondary" />
            Malla de Turnos
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">
            Asignación de turnos por colaborador/a
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <LockToggle
            isLocked={isLocked}
            subject={lockSucursal ? `la malla de ${lockSucursal}` : 'la malla'}
            onToggle={handleToggleLock}
            disabledReason={lockSucursal ? undefined : 'Elige una sucursal para bloquear su malla'}
          />
          <button
            onClick={() => setShowDownloadModal(true)}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all duration-150"
            style={{ boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}
          >
            <FileSpreadsheet size={15} />
            Descargar Malla
          </button>
          <button
            onClick={() => setShowExcelPanel(true)}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-teal-700 active:scale-95 transition-all duration-150"
            style={{ boxShadow: '0 2px 8px rgba(13,148,136,0.3)' }}
          >
            <FileSpreadsheet size={15} />
            Excel
          </button>
          {!isLocked && (
            <>
              <button
                onClick={() => setShowBulkShiftModal(true)}
                disabled={isReadonly}
                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ boxShadow: '0 2px 8px rgba(5,150,105,0.3)' }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Turno masivo
              </button>
              <button
                onClick={() => setShowAssignModal(true)}
                disabled={isReadonly}
                className="flex items-center gap-2 bg-secondary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ boxShadow: '0 2px 8px rgba(29,91,212,0.3)' }}
              >
                <PenLine size={15} />
                Asignar en bloque
              </button>
            </>
          )}
        </div>
      </div>

      {isLocked && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          <span>🔒</span>
          <span>
            La malla está bloqueada. Solo puedes visualizar los turnos. Haz clic en{' '}
            <strong>Bloqueada</strong> para ingresar tu PIN y editar.
          </span>
        </div>
      )}

      <MallaFilters
        selectedMes={selectedMes}
        setSelectedMes={setSelectedMes}
        selectedArea={selectedArea}
        setSelectedArea={setSelectedArea}
        selectedSucursal={selectedSucursal}
        setSelectedSucursal={setSelectedSucursal}
        selectedTurno={selectedTurno}
        setSelectedTurno={setSelectedTurno}
        turnoOptions={turnoOptions}
        selectedCargo={selectedCargo}
        setSelectedCargo={setSelectedCargo}
        selectedHoras={selectedHoras}
        setSelectedHoras={setSelectedHoras}
        nameSearch={nameSearch}
        setNameSearch={setNameSearch}
      />

      <div
        className="mt-4 bg-card rounded-2xl border border-border"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <MallaGrid
          workers={filteredWorkers}
          scheduleData={currentMonthSchedule}
          specialDaysData={currentMonthSpecialDays}
          shifts={shifts}
          daysOfWeek={daysOfWeek}
          daysInMonth={daysInMonth}
          monthLabel={selectedMes}
          getAlerts={getAlerts}
          getCompliance={getCompliance}
          getWeekUnderHours={getWeekUnderHours}
          onCellChange={handleCellChange}
          onSpecialDayChange={handleSpecialDayChange}
          contractedHoursOverride={contractedHoursOverride}
          onContractedHoursChange={handleContractedHoursChange}
          holidayDayIndices={holidayDayIndices}
        />
      </div>

      <div className="mt-6">
        <MallaSummary
          workers={filteredWorkers}
          scheduleData={currentMonthSchedule}
          specialDaysData={currentMonthSpecialDays}
          shifts={shifts}
          totalCajas={selectedSucursal !== 'Todas' ? getSucursalCajas(selectedSucursal) : 20}
          daysInMonth={daysInMonth}
          monthLabel={selectedMes}
          selectedCargo={selectedCargo}
        />
      </div>

      {showDownloadModal && (
        <MallaDownloadModal
          workers={filteredWorkers}
          scheduleData={scheduleData}
          specialDays={specialDays}
          shifts={shifts}
          currentMonth={selectedMes}
          onClose={() => setShowDownloadModal(false)}
        />
      )}
      {showExcelPanel && (
        <MallaExcelPanel
          workers={filteredWorkers}
          scheduleData={currentMonthSchedule}
          specialDaysData={currentMonthSpecialDays}
          shifts={shifts}
          daysInMonth={daysInMonth}
          daysOfWeek={daysOfWeek}
          monthLabel={selectedMes}
          onImport={handleImportCell}
          onClose={() => setShowExcelPanel(false)}
        />
      )}
      {showBulkShiftModal && (
        <BulkShiftModal
          workers={filteredWorkers}
          shifts={shifts}
          onAssign={handleBulkShiftAssign}
          onClose={() => setShowBulkShiftModal(false)}
        />
      )}
      {showAssignModal && (
        <AssignModal
          workers={filteredWorkers}
          shifts={shifts}
          daysOfWeek={daysOfWeek}
          onAssign={handleAssign}
          onAssignSpecialDay={handleAssignSpecialDay}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}

// end of file

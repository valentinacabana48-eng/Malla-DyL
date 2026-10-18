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
  const { isLocked, setLocked } = useSharedLock('malla_locked');

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

  const getAlerts = (workerId: string): string[] => {
    const sched = currentMonthSchedule[workerId] || [];
    const workerSpecialDays = currentMonthSpecialDays[workerId] || {};
    const alerts: string[] = [];
    const worker = workers.find((w) => w.id === workerId);
    const horasLimite = contractedHoursOverride[workerId] ?? worker?.horasContratadas ?? 42;

    // Count actual shifts assigned (non-null, non-DESC, non-special)
    const assignedShifts = sched.filter(
      (s, i) => s && s !== 'DESC' && !workerSpecialDays[i]
    ).length;
    // Only run alerts if the worker has at least some shifts assigned this month
    if (assignedShifts === 0) return alerts;

    let consecutive = 0;
    let maxConsec = 0;
    for (let i = 0; i < daysInMonth; i++) {
      const isSpecial = !!workerSpecialDays[i];
      if (!isSpecial && sched[i] && sched[i] !== 'DESC') {
        consecutive++;
        maxConsec = Math.max(maxConsec, consecutive);
      } else {
        consecutive = 0;
      }
    }
    if (maxConsec >= 7) alerts.push(`${maxConsec} días consecutivos trabajados (máx. 6)`);

    // Count total Sundays in this month
    const totalSundaysInMonth = daysOfWeek.slice(0, daysInMonth).filter((d) => d === 'D').length;

    let sundaysWorked = 0;
    let sundaysOff = 0;
    for (let i = 0; i < daysInMonth; i++) {
      if (daysOfWeek[i] === 'D') {
        const isSpecial = !!workerSpecialDays[i];
        if (!isSpecial && sched[i] && sched[i] !== 'DESC') {
          sundaysWorked++;
        } else {
          sundaysOff++;
        }
      }
    }

    // Only require minimum 2 Sundays off if the month actually has 2+ Sundays
    const minSundaysOff = Math.min(2, totalSundaysInMonth);
    if (totalSundaysInMonth >= 2 && sundaysOff < minSundaysOff) {
      alerts.push(
        `Solo ${sundaysOff} domingo(s) de descanso en el mes (mínimo ${minSundaysOff} requeridos)`
      );
    }
    // Weekly hours check: group days into ISO weeks (Mon–Sun) and sum hours
    const weekHours: Record<number, number> = {};
    for (let i = 0; i < daysInMonth; i++) {
      const isSpecial = !!workerSpecialDays[i];
      if (isSpecial || !sched[i] || sched[i] === 'DESC') continue;
      const shiftInfo = shifts[sched[i] as string];
      if (!shiftInfo) continue;
      // Determine ISO week number for this day
      const parts = (selectedMes || '').split(' ');
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
      const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 7;
      const year = parseInt(parts[1] || '2026', 10);
      const date = new Date(year, monthIdx, i + 1);
      // ISO week: Mon=0 ... Sun=6; week starts Monday
      const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon, 6=Sun
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - dayOfWeek);
      const weekKey = weekStart.getTime();
      const hrs = (() => {
        if (!shiftInfo.start || !shiftInfo.end) return 0;
        const [sh, sm] = shiftInfo.start.split(':').map(Number);
        const [eh, em] = shiftInfo.end.split(':').map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        const gross = mins / 60;
        if (
          (shiftInfo as { colacion?: number }).colacion &&
          (shiftInfo as { colacion?: number }).colacion! > 0
        ) {
          return gross - (shiftInfo as { colacion?: number }).colacion! / 60;
        }
        return gross;
      })();
      weekHours[weekKey] = (weekHours[weekKey] || 0) + hrs;
    }
    const maxWeekHours = Math.max(0, ...Object.values(weekHours));
    // Only alert if hours exceed the limit by more than 0.5h (avoid rounding false positives)
    if (maxWeekHours > horasLimite + 0.5)
      alerts.push(
        `Semana con ${Math.round(maxWeekHours * 10) / 10}h (límite ${horasLimite}h/semana)`
      );
    return alerts;
  };

  // Returns a Set of week-start timestamps (ms) where the worker has FEWER hours
  // programmed than their contracted weekly hours
  const getWeekUnderHours = (workerId: string): Set<number> => {
    const sched = currentMonthSchedule[workerId] || [];
    const workerSpecialDays = currentMonthSpecialDays[workerId] || {};
    const worker = workers.find((w) => w.id === workerId);
    const horasLimite = contractedHoursOverride[workerId] ?? worker?.horasContratadas ?? 42;

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
    const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 7;
    const year = parseInt(parts[1] || '2026', 10);

    // Build month-clipped weeks (same logic as buildWeekOptions in MallaSummary)
    // Week 1 starts at day 1, each week ends on Sunday (or end of month)
    const monthClippedWeeks: { startDay: number; endDay: number; key: number }[] = [];
    let d = 1;
    while (d <= daysInMonth) {
      const date = new Date(year, monthIdx, d);
      const dow = (date.getDay() + 6) % 7; // 0=Mon, 6=Sun
      const weekMonday = d - dow;
      const weekSunday = weekMonday + 6;
      const startDay = Math.max(1, weekMonday);
      const endDay = Math.min(daysInMonth, weekSunday);
      // Use startDay as the key (unique per week within month)
      monthClippedWeeks.push({ startDay, endDay, key: startDay });
      d = endDay + 1;
    }

    // Map weekKey → hours
    const weekData: Record<number, { hours: number }> = {};
    for (const wk of monthClippedWeeks) {
      weekData[wk.key] = { hours: 0 };
    }

    for (let i = 0; i < daysInMonth; i++) {
      const dayNum = i + 1;
      const isSpecial = !!workerSpecialDays[i];
      if (isSpecial || !sched[i] || sched[i] === 'DESC') continue;

      const shiftInfo = shifts[sched[i] as string];
      if (!shiftInfo || !shiftInfo.start || !shiftInfo.end) continue;

      const [sh, sm] = shiftInfo.start.split(':').map(Number);
      const [eh, em] = shiftInfo.end.split(':').map(Number);
      let mins = eh * 60 + em - (sh * 60 + sm);
      if (mins < 0) mins += 24 * 60;
      let hrs = mins / 60;
      const col = (shiftInfo as { colacion?: number }).colacion;
      if (col && col > 0) hrs -= col / 60;

      // Find which month-clipped week this day belongs to
      const wk = monthClippedWeeks.find((w) => dayNum >= w.startDay && dayNum <= w.endDay);
      if (wk) {
        weekData[wk.key].hours += hrs;
      }
    }

    // Count actual scheduled (working) days per week
    const weekScheduledDays: Record<number, number> = {};
    for (const wk of monthClippedWeeks) {
      weekScheduledDays[wk.key] = 0;
    }
    for (let i = 0; i < daysInMonth; i++) {
      const dayNum = i + 1;
      const isSpecial = !!workerSpecialDays[i];
      if (isSpecial || !sched[i] || sched[i] === 'DESC') continue;
      const wk = monthClippedWeeks.find((w) => dayNum >= w.startDay && dayNum <= w.endDay);
      if (wk) weekScheduledDays[wk.key]++;
    }

    const underWeeks = new Set<number>();
    for (const wk of monthClippedWeeks) {
      const data = weekData[wk.key];
      if (!data || data.hours === 0) continue;
      // Use actual scheduled days to compute proportional required hours
      const scheduledDays = weekScheduledDays[wk.key] || 0;
      if (scheduledDays === 0) continue;
      // Calendar days of this month in this week (for proportional check)
      const calendarDaysInMonth = wk.endDay - wk.startDay + 1;
      // For partial weeks (first/last week spanning another month), use proportional required hours
      // based on how many calendar days of this month fall in the week
      const isPartialWeek = calendarDaysInMonth < 7;
      const requiredHours = isPartialWeek
        ? horasLimite * (calendarDaysInMonth / 7)
        : horasLimite * (scheduledDays / 7);
      const tolerance = 0.1; // 10% tolerance
      if (data.hours < requiredHours * (1 - tolerance)) {
        underWeeks.add(wk.key);
      }
    }
    return underWeeks;
  };

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
          <LockToggle isLocked={isLocked} subject="la malla" onToggle={handleToggleLock} />
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

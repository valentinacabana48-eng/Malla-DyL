'use client';
import { useRequestMarks } from '@/hooks/useRequestMarks';
import React, { useState, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  Download,
  FileSpreadsheet,
  Grid3x3,
  PenLine,
  Send,
  Stethoscope,
  Upload,
  Zap,
} from 'lucide-react';
import MenuButton from '@/components/ui/MenuButton';
import {
  useAppContext,
  getDaysOfWeekForMonth,
  getDaysInMonth,
  monthLabelToKey,
  getChileanHolidays,
  shiftsForSucursales,
  type ShiftCode,
  type Worker,
} from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';
import { useAuth } from '@/context/AuthContext';
import { evaluateMonth, type MonthCompliance } from '@/lib/compliance';
import MallaFilters from './MallaFilters';
import MallaGrid from './MallaGrid';
import AssignModal from './AssignModal';
import MallaSummary from './MallaSummary';
import { CoberturaHorasDia } from './CoberturaHoras';
import LockToggle from '@/components/LockToggle';
import { useSharedLock } from '@/hooks/useSharedLock';
import BulkShiftModal from './BulkShiftModal';
import MallaExcelPanel from './MallaExcelPanel';
import MallaDownloadModal from './MallaDownloadModal';
import MallaMobile from './MallaMobile';
import { usePublishState, PublishModal } from './PublishMalla';
import LicenciaModal, { LicenciaAvisos, MESES_CAP } from './LicenciaModal';

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
    isMonthLoaded,
  } = useAppContext();
  // Mientras llega la malla de un mes no se muestra (para no editar sobre algo vacío)
  const monthReady = isMonthLoaded(monthLabelToKey(selectedMes));
  const isReadonly = useReadonly();
  const { can, allowedSucursales } = useAuth();

  // Áreas, sucursales y cargos elegidos ([] = todas / todos)
  const [selectedAreas, setSelectedAreas] = useState<string[]>(
    globalArea && globalArea !== 'Todas' ? [globalArea] : []
  );
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>(
    globalSucursal && globalSucursal !== 'Todas' ? [globalSucursal] : []
  );
  const [selectedTurno, setSelectedTurno] = useState('Todos');
  const [selectedCargos, setSelectedCargos] = useState<string[]>([]);
  const [selectedHoras, setSelectedHoras] = useState<string[]>([]);
  const [nameSearch, setNameSearch] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkShiftModal, setShowBulkShiftModal] = useState(false);
  const [showLicenciaModal, setShowLicenciaModal] = useState(false);
  // "Hacer turnos nuevos" al volver de licencia: Asignar con esa persona desde el día que vuelve
  const [turnosNuevos, setTurnosNuevos] = useState<{ worker: Worker; fromDay: number } | null>(
    null
  );
  const [showExcelPanel, setShowExcelPanel] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  // Celular: filtros plegados y vista simple (por día / por persona) en vez de la grilla
  const [showFullGridMobile, setShowFullGridMobile] = useState(false);
  const [contractedHoursOverride, setContractedHoursOverride] = useState<Record<string, number>>(
    {}
  );

  // ─── Lock state (compartido entre dispositivos, solo admin lo cambia) ──────
  // El bloqueo aplica cuando hay UNA sucursal elegida
  const lockSucursal = selectedSucursales.length === 1 ? selectedSucursales[0] : null;
  const { isLocked, setLocked } = useSharedLock(
    lockSucursal ? `malla_locked:${lockSucursal}` : null
  );

  const handleToggleLock = async (locked: boolean) => {
    const ok = await setLocked(locked);
    if (ok) toast.success(locked ? '🔒 Malla bloqueada' : '🔓 Malla desbloqueada');
    return ok;
  };
  // ─────────────────────────────────────────────────────────────────────────

  // ─── Publicar para Mis turnos (por sucursal y mes) ─────────────────────────
  const [showPublishModal, setShowPublishModal] = useState(false);
  const publishSucursal =
    selectedSucursales.length === 1
      ? selectedSucursales[0]
      : allowedSucursales?.length === 1
        ? allowedSucursales[0]
        : null;
  const canPublish =
    can('malla_publicar') &&
    !!publishSucursal &&
    (!allowedSucursales || allowedSucursales.includes(publishSucursal));
  const publishState = usePublishState(selectedMes, canPublish ? publishSucursal : null);
  // ─────────────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    setSelectedSucursales(globalSucursal && globalSucursal !== 'Todas' ? [globalSucursal] : []);
  }, [globalSucursal]);

  React.useEffect(() => {
    if (globalArea && globalArea !== 'Todas') {
      setSelectedAreas([globalArea]);
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
  const requestMarks = useRequestMarks(
    monthLabelToKey(selectedMes),
    currentMonthSchedule,
    currentMonthSpecialDays
  );

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (w.estado !== 'Activo') return false;
      if (selectedAreas.length > 0 && !selectedAreas.includes(w.area)) return false;
      if (selectedSucursales.length > 0 && !selectedSucursales.includes(w.sucursal)) return false;
      if (selectedCargos.length > 0 && !selectedCargos.includes(w.cargo)) return false;
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
    selectedAreas,
    selectedSucursales,
    selectedCargos,
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

  // Turnos que se pueden asignar a las trabajadoras que se están viendo (compartidos + de su sucursal)
  const pickerShifts = useMemo(
    () => shiftsForSucursales(shifts, [...new Set(filteredWorkers.map((w) => w.sucursal))]),
    [shifts, filteredWorkers]
  );

  const turnoOptions = useMemo(() => {
    const opts = ['Todos'];
    Object.values(pickerShifts).forEach((s) => {
      if (s.code !== 'DESC' && s.start) {
        opts.push(`${s.label} (${s.start} - ${s.end})`);
      }
    });
    return opts;
  }, [pickerShifts]);

  return (
    <div className="p-4 lg:p-6 xl:p-8 max-w-screen-2xl mx-auto">
      <div className="flex items-start justify-between mb-5 lg:mb-7 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <CalendarDays size={20} className="text-secondary" />
            Malla de Turnos
          </h1>
          <p className="hidden lg:block text-muted-foreground text-sm mt-1 ml-3">
            Asignación de turnos por colaborador/a
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {can('malla_publicar') && (
            <button
              type="button"
              onClick={() => setShowPublishModal(true)}
              disabled={!canPublish}
              title={canPublish ? undefined : 'Elige una sola sucursal para publicar su malla'}
              className="relative flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}
            >
              <Send size={15} />
              {publishState.pending.length > 0 ? 'Publicar cambios' : 'Publicar'}
              {publishState.pending.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold flex items-center justify-center">
                  {publishState.pending.length}
                </span>
              )}
            </button>
          )}
          <MenuButton
            label="Asignar"
            icon={<PenLine size={15} />}
            items={[
              {
                label: 'Un turno a varias personas',
                hint: 'El mismo turno a varias, en los días que elijas',
                icon: <Zap size={15} />,
                onSelect: () => setShowBulkShiftModal(true),
                disabled: isLocked || isReadonly,
              },
              {
                label: 'Pintar varias casillas',
                hint: 'Eliges un turno y tocas las casillas',
                icon: <Grid3x3 size={15} />,
                onSelect: () => setShowAssignModal(true),
                disabled: isLocked || isReadonly,
              },
              {
                label: 'Licencia, permiso o vacaciones',
                hint: 'Guarda los turnos que tenía; imprime la hoja de permiso',
                icon: <Stethoscope size={15} />,
                onSelect: () => setShowLicenciaModal(true),
                disabled: isReadonly,
              },
            ]}
          />
          <MenuButton
            label="Excel"
            icon={<FileSpreadsheet size={15} />}
            items={[
              {
                label: 'Descargar por fechas',
                hint: 'Elige desde y hasta qué día',
                icon: <Download size={15} />,
                onSelect: () => setShowDownloadModal(true),
              },
              {
                label: 'Descargar o subir el mes',
                hint: 'La malla del mes, para revisarla o cargarla',
                icon: <Upload size={15} />,
                onSelect: () => setShowExcelPanel(true),
              },
            ]}
          />
          <LockToggle
            isLocked={isLocked}
            subject={lockSucursal ? `la malla de ${lockSucursal}` : 'la malla'}
            onToggle={handleToggleLock}
            compact
            disabledReason={
              lockSucursal ? undefined : 'Elige una sola sucursal para bloquear su malla'
            }
          />
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

      {!isReadonly && (
        <LicenciaAvisos
          workers={workers}
          onTurnosNuevos={(workerId, vuelve) => {
            const worker = workers.find((w) => w.id === workerId);
            if (!worker) return;
            const [y, m, d] = vuelve.split('-').map(Number);
            setSelectedMes(`${MESES_CAP[m - 1]} ${y}`);
            setTurnosNuevos({ worker, fromDay: d - 1 });
          }}
        />
      )}

      {canPublish && publishState.pending.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPublishModal(true)}
          className="mb-4 w-full text-left flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm font-medium hover:bg-amber-100"
        >
          <span>⚠️</span>
          <span>
            Hay cambios sin publicar en la malla de {publishSucursal} ({publishState.pending.length}{' '}
            trabajadora(s)). Las trabajadoras siguen viendo la versión anterior.{' '}
            <strong className="underline">Ver y publicar</strong>
          </span>
        </button>
      )}

      {/* Celular: cambiar entre la vista simple y la malla completa, siempre arriba */}
      <div className="lg:hidden mb-3 flex p-1 rounded-xl bg-muted" role="tablist">
        {[
          { full: false, label: 'Vista simple' },
          { full: true, label: 'Malla completa' },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            role="tab"
            aria-selected={showFullGridMobile === opt.full}
            onClick={() => setShowFullGridMobile(opt.full)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${showFullGridMobile === opt.full ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <MallaFilters
          selectedMes={selectedMes}
          setSelectedMes={setSelectedMes}
          selectedAreas={selectedAreas}
          setSelectedAreas={setSelectedAreas}
          selectedSucursales={selectedSucursales}
          setSelectedSucursales={setSelectedSucursales}
          selectedTurno={selectedTurno}
          setSelectedTurno={setSelectedTurno}
          turnoOptions={turnoOptions}
          selectedCargos={selectedCargos}
          setSelectedCargos={setSelectedCargos}
          selectedHoras={selectedHoras}
          setSelectedHoras={setSelectedHoras}
          nameSearch={nameSearch}
          setNameSearch={setNameSearch}
        />
      </div>

      {!monthReady ? (
        <div className="mt-4 flex items-center justify-center gap-3 py-16 bg-card rounded-2xl border border-border text-sm text-muted-foreground">
          <div className="w-6 h-6 rounded-full border-[3px] border-secondary/20 border-t-secondary animate-spin" />
          Cargando la malla de {selectedMes}…
        </div>
      ) : (
        <>
          {/* Celular: vista simple; la grilla completa se elige arriba */}
          <div className={showFullGridMobile ? 'hidden' : 'lg:hidden mt-4'}>
            <MallaMobile
              workers={filteredWorkers}
              scheduleData={currentMonthSchedule}
              specialDaysData={currentMonthSpecialDays}
              shifts={shifts}
              daysInMonth={daysInMonth}
              monthLabel={selectedMes}
              holidayDayIndices={holidayDayIndices}
              isLocked={isLocked}
              onCellChange={handleCellChange}
              onSpecialDayChange={handleSpecialDayChange}
              requestMarks={requestMarks}
            />
          </div>
          <div className={showFullGridMobile ? '' : 'hidden lg:block'}>
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
                requestMarks={requestMarks}
              />
            </div>

            <div className="mt-6">
              <CoberturaHorasDia
                workers={filteredWorkers}
                scheduleData={currentMonthSchedule}
                specialDaysData={currentMonthSpecialDays}
                shifts={shifts}
                daysInMonth={daysInMonth}
                monthLabel={selectedMes}
              />
            </div>

            <div className="mt-6">
              <MallaSummary
                workers={filteredWorkers}
                scheduleData={currentMonthSchedule}
                specialDaysData={currentMonthSpecialDays}
                shifts={shifts}
                totalCajas={
                  selectedSucursales.length > 0
                    ? selectedSucursales.reduce((sum, s) => sum + getSucursalCajas(s), 0)
                    : 20
                }
                daysInMonth={daysInMonth}
                monthLabel={selectedMes}
                selectedCargo={selectedCargos.length === 1 ? selectedCargos[0] : 'Todos'}
              />
            </div>
          </div>
        </>
      )}

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
      {showPublishModal && canPublish && (
        <PublishModal
          state={publishState}
          monthLabel={selectedMes}
          onClose={() => setShowPublishModal(false)}
        />
      )}
      {showBulkShiftModal && (
        <BulkShiftModal
          workers={filteredWorkers}
          shifts={pickerShifts}
          onAssign={handleBulkShiftAssign}
          onClose={() => setShowBulkShiftModal(false)}
        />
      )}
      {showLicenciaModal && (
        <LicenciaModal
          workers={filteredWorkers}
          isLocked={isLocked}
          onClose={() => setShowLicenciaModal(false)}
        />
      )}
      {turnosNuevos && (
        <BulkShiftModal
          workers={[turnosNuevos.worker]}
          shifts={shiftsForSucursales(shifts, [turnosNuevos.worker.sucursal])}
          fromDayIndex={turnosNuevos.fromDay}
          onAssign={async (ids, idxs, shift) => {
            await handleBulkShiftAssign(ids, idxs, shift);
            setTurnosNuevos(null);
          }}
          onClose={() => setTurnosNuevos(null)}
        />
      )}
      {showAssignModal && (
        <AssignModal
          workers={filteredWorkers}
          shifts={pickerShifts}
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

'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { useAppContext } from '@/context/AppContext';
import {
  getDatesInRange,
  getTodayStr,
  getDefaultStartDate,
  getDefaultEndDate,
  formatPeriodLabel,
  formatDateLabel,
  getStatusStyle,
  getStatusLabel,
  ATTENDANCE_STATUSES,
  SELECTABLE_STATUSES,
  ABSENCE_REASON_STATUS,
} from './asistenciaUtils';
import DailyAlertModal from './DailyAlertModal';
import OvertimeModal from './OvertimeModal';
import RetiroModal from './RetiroModal';
import LockToggle from '@/components/LockToggle';
import { useSharedLock } from '@/hooks/useSharedLock';
import { useAuth } from '@/context/AuthContext';
import {
  CalendarCheck,
  Download,
  Clock,
  ChevronDown,
  AlertCircle,
  RefreshCw,
  Users,
  CheckCheck,
  Calendar,
  Sun,
  Sunset,
  Lock,
  Unlock,
  X,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';

// ─── Stable Supabase client (module-level singleton) ─────────────────────────
// CRITICAL: Must NOT be inside the component or useMemo — recreating the client
// on every render causes loadData's useEffect to re-fire and overwrite optimistic
// updates before the DB write has committed.
const supabase = getSupabase();

interface AttendanceRecord {
  workerId: string;
  recordDate: string;
  status: string;
  absenceReason: string;
  notes: string;
  updatedAt?: string;
  /** Retiro anticipado: horas a descontar ese día */
  retiroHoras?: number;
  retiroMotivo?: string;
  /** Marcado por una jefa de caja (o corregido antes de aprobar): aún no es oficial */
  pending?: boolean;
  /** Correo de quien lo marcó, si está por aprobar */
  proposedBy?: string;
}

interface OvertimeRecord {
  workerId: string;
  recordDate: string;
  hours: number;
  notes: string;
  /** Anotadas por alguien sin permiso de aprobar: no cuentan hasta que se aprueben */
  pending?: boolean;
  proposedBy?: string;
  approvedBy?: string;
}

interface DailyAlertState {
  date: string;
  dateLabel: string;
  workers: {
    id: string;
    name: string;
    initials: string;
    avatarColor: string;
    scheduledShift: string | null;
  }[];
}

interface OvertimeModalState {
  workerId: string;
  workerName: string;
  date: string;
  dateLabel: string;
  currentHours: number;
}

// ─── Lock Modal ───────────────────────────────────────────────────────────────
interface LockModalProps {
  mode: 'lock' | 'unlock';
  dateLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  error: string;
}

function LockModal({ mode, dateLabel, onConfirm, onClose, error }: LockModalProps) {
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setSaving(true);
    await onConfirm();
    setSaving(false);
  };

  const title = mode === 'lock' ? 'Guardar y bloquear día' : 'Desbloquear día';
  const desc =
    mode === 'lock'
      ? `Una vez bloqueado el ${dateLabel}, nadie podrá modificar ni eliminar sus registros hasta que un administrador lo desbloquee.`
      : `Se podrán volver a editar los registros del ${dateLabel}.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${mode === 'unlock' ? 'bg-green-50' : 'bg-red-50'}`}
            >
              {mode === 'unlock' ? (
                <Unlock size={18} className="text-green-600" />
              ) : (
                <Lock size={18} className="text-red-500" />
              )}
            </div>
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">{desc}</p>
        {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50 ${mode === 'unlock' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}
          >
            {saving ? 'Guardando...' : mode === 'lock' ? 'Bloquear' : 'Desbloquear'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Multi-Select Dropdown (sucursales, cargos) ──────────────────────────────
interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (val: string[]) => void;
  allLabel: string;
  pluralLabel: string;
  emptyLabel: string;
}

function MultiSelect({
  options,
  selected,
  onChange,
  allLabel,
  pluralLabel,
  emptyLabel,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggle(name: string) {
    if (selected.includes(name)) {
      onChange(selected.filter((s) => s !== name));
    } else {
      onChange([...selected, name]);
    }
  }

  const label =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ${pluralLabel}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 pl-3 pr-2 py-3 lg:py-2 text-sm lg:text-xs border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer w-full lg:w-auto min-w-[140px] lg:max-w-[200px]"
      >
        <span className="flex-1 text-left truncate">{label}</span>
        {selected.length > 0 && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="text-gray-400 hover:text-gray-600 shrink-0 cursor-pointer"
          >
            <X size={11} />
          </span>
        )}
        <ChevronDown size={12} className="text-gray-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 lg:right-auto bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[180px] max-h-56 overflow-y-auto">
          {options.length === 0 && <p className="px-3 py-2 text-xs text-gray-400">{emptyLabel}</p>}
          {options.map((opt) => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`w-full flex items-center gap-2 px-3 py-3 lg:py-2 text-sm lg:text-xs text-left hover:bg-gray-50 transition-colors ${checked ? 'text-blue-700 font-medium' : 'text-gray-700'}`}
              >
                <span
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}
                >
                  {checked && (
                    <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                      <path
                        d="M1.5 4.5L3.5 6.5L7.5 2.5"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AsistenciaContent() {
  const {
    workers,
    sucursales,
    shifts,
    scheduleData,
    specialDays,
    globalSucursal,
    globalArea,
    getLicenciaTurno,
    isMonthLoaded,
  } = useAppContext();

  const defaultStart = getDefaultStartDate();
  const defaultEnd = getDefaultEndDate(defaultStart);

  const [startDate, setStartDate] = useState<string>(defaultStart);
  const [endDate, setEndDate] = useState<string>(defaultEnd);
  const [filterSucursal, setFilterSucursal] = useState<string[]>([]);
  const [filterArea, setFilterArea] = useState('Todas');
  const [filterCargo, setFilterCargo] = useState<string[]>([]);
  const [filterTurno, setFilterTurno] = useState<'Todos' | 'AM' | 'Tarde'>('Todos');
  const [filterTurnoEspecifico, setFilterTurnoEspecifico] = useState<string>('Todos');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [searchName, setSearchName] = useState<string>('');
  // Celular: los filtros van en un panel que se abre con el botón "Filtros"
  const [showFilters, setShowFilters] = useState(false);
  const dateStripRef = useRef<HTMLDivElement>(null);

  // En el celular se abre directo el día de hoy: la tabla del período no cabe en la pantalla
  useEffect(() => {
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    const today = getTodayStr();
    if (today >= startDate && today <= endDate) setSelectedDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La barra de fechas se desplaza sola hasta el día elegido
  useEffect(() => {
    if (!selectedDate) return;
    dateStripRef.current
      ?.querySelector(`[data-date="${selectedDate}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selectedDate, filterSucursal]);

  const [attendance, setAttendance] = useState<Record<string, Record<string, AttendanceRecord>>>(
    {}
  );
  const [overtime, setOvertime] = useState<Record<string, Record<string, OvertimeRecord>>>({});
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // Persistent store of ALL attendance records ever loaded — never shrinks when range changes
  const allAttendanceRef = useRef<Record<string, Record<string, AttendanceRecord>>>({});

  const [dailyAlert, setDailyAlert] = useState<DailyAlertState | null>(null);
  const [overtimeModal, setOvertimeModal] = useState<OvertimeModalState | null>(null);
  const [retiroModal, setRetiroModal] = useState<{
    workerId: string;
    workerName: string;
    date: string;
    dateLabel: string;
    currentHours: number;
    currentReason: string;
  } | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // ── Per-day lock state ────────────────────────────────────────────────────
  // Días bloqueados por sucursal (sucursal '' = bloqueo antiguo, aplica a todas)
  const [lockRows, setLockRows] = useState<
    { record_date: string; sucursal: string; area?: string }[]
  >([]);
  const [lockModal, setLockModal] = useState<{
    date: string;
    dateLabel: string;
    mode: 'lock' | 'unlock';
  } | null>(null);
  const [lockError, setLockError] = useState('');

  // ── Bloqueos por sucursal (compartidos entre dispositivos, solo admin) ────
  // Se bloquea cuando hay UNA sucursal elegida. Si se ven varias, se respetan los
  // días bloqueados de cualquiera de ellas.
  const lockSucursal = filterSucursal.length === 1 ? filterSucursal[0] : null;
  const { isLocked: isPanelLocked, setLocked: setPanelLocked } = useSharedLock(
    lockSucursal ? `asistencia_locked:${lockSucursal}` : null
  );
  const { user, can, canManageSucursal, allowedAreas, canMarkAttendance, isAsistencia } = useAuth();
  const canApprove = can('asistencia_aprobar');
  const canApproveOvertime = can('horas_extra_aprobar');
  const canOvertime = can('horas_extra') || canApproveOvertime;
  // Área que se bloquea: '' = toda la sucursal (quien la maneja completa); si no, su área
  const lockArea: string | null = canManageSucursal
    ? ''
    : allowedAreas?.length === 1
      ? allowedAreas[0]
      : filterArea !== 'Todas'
        ? filterArea
        : null;
  const lockedDates = useMemo(
    () =>
      new Set(
        lockRows
          .filter(
            (r) =>
              (r.sucursal === '' ||
                filterSucursal.length === 0 ||
                filterSucursal.includes(r.sucursal)) &&
              (!r.area ||
                r.area === filterArea ||
                (allowedAreas?.length === 1 && r.area === allowedAreas[0]))
          )
          .map((r) => r.record_date)
      ),
    [lockRows, filterSucursal, filterArea, allowedAreas]
  );

  // Sync global sucursal and area on mount/change
  useEffect(() => {
    if (globalSucursal && globalSucursal !== 'Todas') {
      setFilterSucursal([globalSucursal]);
    }
  }, [globalSucursal]);

  useEffect(() => {
    if (globalArea && globalArea !== 'Todas') {
      setFilterArea(globalArea);
    }
  }, [globalArea]);

  // ── Month-aware helpers ──────────────────────────────────────────────────
  function getMonthKeyAndDayIndex(dateStr: string): { monthKey: string; dayIndex: number } {
    const [y, m, d] = dateStr.split('-').map(Number);
    return {
      monthKey: `${y}-${String(m).padStart(2, '0')}`,
      dayIndex: d - 1,
    };
  }

  function getShiftForDate(workerId: string, dateStr: string): string | null {
    const { monthKey, dayIndex } = getMonthKeyAndDayIndex(dateStr);
    return ((scheduleData[monthKey] || {})[workerId] || [])[dayIndex] ?? null;
  }

  function getSpecialForDate(workerId: string, dateStr: string): string | null {
    const { monthKey, dayIndex } = getMonthKeyAndDayIndex(dateStr);
    return ((specialDays[monthKey] || {})[workerId] || {})[dayIndex] ?? null;
  }

  // Derive dates from range
  const dates =
    startDate && endDate && startDate <= endDate ? getDatesInRange(startDate, endDate) : [];

  // Period key for DB queries — use actual date range, not fixed month
  const periodKey = `${startDate}_${endDate}`;
  // La malla de los meses del período ya llegó (sin ella "Todas asistieron" marcaría mal)
  const periodReady = [...new Set(dates.map((d) => d.slice(0, 7)))].every(isMonthLoaded);

  // Filter workers
  const filteredWorkers = workers.filter((w) => {
    if (w.estado !== 'Activo') return false;
    if (filterSucursal.length > 0 && !filterSucursal.includes(w.sucursal)) return false;
    if (filterArea !== 'Todas' && w.area !== filterArea) return false;
    if (filterCargo.length > 0 && !filterCargo.includes(w.cargo)) return false;
    if (searchName.trim()) {
      const q = searchName.trim().toLowerCase();
      if (!w.name.toLowerCase().includes(q)) return false;
    }
    if (filterTurno !== 'Todos') {
      const datesForFilter = selectedDate ? [selectedDate] : dates.length > 0 ? dates : [];
      if (datesForFilter.length === 0) return true;
      const hasMatchingTurno = datesForFilter.some((dt) => {
        const shiftCode = getShiftForDate(w.id, dt);
        if (!shiftCode || shiftCode === 'DESC') return false;
        const shift = shifts[shiftCode];
        if (!shift || !shift.start) return false;
        const startHour = parseInt(shift.start.split(':')[0], 10);
        if (filterTurno === 'AM') return startHour < 12;
        if (filterTurno === 'Tarde') return startHour >= 12;
        return false;
      });
      return hasMatchingTurno;
    }
    if (filterTurnoEspecifico !== 'Todos') {
      const datesForFilter = selectedDate ? [selectedDate] : dates.length > 0 ? dates : [];
      if (datesForFilter.length === 0) return true;
      const hasShift = datesForFilter.some((dt) => {
        const shiftCode = getShiftForDate(w.id, dt);
        return shiftCode === filterTurnoEspecifico;
      });
      return hasShift;
    }
    return true;
  });

  // Load attendance, overtime, and locked dates for date range
  const loadData = useCallback(async () => {
    if (!startDate || !endDate || startDate > endDate) return;
    setLoading(true);
    try {
      const [attRows, otRows, lockRes, propRes] = await Promise.all([
        fetchAll((from, to) =>
          supabase
            .from('attendance_records')
            .select('*')
            .gte('record_date', startDate)
            .lte('record_date', endDate)
            .order('id')
            .range(from, to)
        ),
        fetchAll((from, to) =>
          supabase
            .from('overtime_hours')
            .select('*')
            .gte('record_date', startDate)
            .lte('record_date', endDate)
            .order('id')
            .range(from, to)
        ),
        supabase
          .from('attendance_locked_dates')
          .select('*')
          .gte('record_date', startDate)
          .lte('record_date', endDate),
        fetchAll((from, to) =>
          supabase
            .from('attendance_proposals')
            .select('*')
            .gte('record_date', startDate)
            .lte('record_date', endDate)
            .order('worker_id')
            .order('record_date')
            .range(from, to)
        ).then(
          (data) => ({ data, error: null }),
          (error) => ({ data: null, error })
        ),
      ]);

      // Merge freshly fetched DB records into the persistent allAttendanceRef store.
      // A DB record only wins over an in-memory record if it is strictly newer.
      // This means optimistic updates (which have a fresh updated_at) are never
      // overwritten by a stale DB read triggered by a date-range change.
      attRows.forEach((r: Record<string, unknown>) => {
        const wid = r.worker_id as string;
        const dt = r.record_date as string;
        if (!allAttendanceRef.current[wid]) allAttendanceRef.current[wid] = {};
        const existing = allAttendanceRef.current[wid][dt];
        const rUpdated = (r.updated_at as string) ?? '';
        const existingUpdated = existing?.updatedAt ?? '';
        // Only overwrite if the DB record is strictly newer than what we already have
        if (!existing || rUpdated > existingUpdated) {
          allAttendanceRef.current[wid][dt] = {
            workerId: wid,
            recordDate: dt,
            status: r.status as string,
            absenceReason: (r.absence_reason as string) || '',
            notes: (r.notes as string) || '',
            updatedAt: rUpdated,
            retiroHoras: Number(r.retiro_horas) || 0,
            retiroMotivo: (r.retiro_motivo as string) || '',
          };
        }
      });

      // Lo marcado por las jefas de caja (por aprobar) se ve encima de lo oficial
      if (propRes.error) console.error('Error loading proposals:', propRes.error);
      ((propRes.data as Record<string, unknown>[] | null) ?? []).forEach((r) => {
        const wid = r.worker_id as string;
        const dt = r.record_date as string;
        if (!allAttendanceRef.current[wid]) allAttendanceRef.current[wid] = {};
        const existing = allAttendanceRef.current[wid][dt];
        const rUpdated = (r.updated_at as string) ?? '';
        if (!existing || existing.pending || rUpdated >= (existing.updatedAt ?? '')) {
          allAttendanceRef.current[wid][dt] = {
            workerId: wid,
            recordDate: dt,
            status: r.status as string,
            absenceReason: (r.absence_reason as string) || '',
            notes: (r.notes as string) || '',
            updatedAt: rUpdated,
            retiroHoras: Number(r.retiro_horas) || 0,
            retiroMotivo: (r.retiro_motivo as string) || '',
            pending: true,
            proposedBy: (r.proposed_by_email as string) || '',
          };
        }
      });
      // Lo que estaba por aprobar y ya no está (aprobado o descartado) deja de verse
      const pendingKeys = new Set(
        ((propRes.data as Record<string, unknown>[] | null) ?? []).map(
          (r) => `${r.worker_id}_${r.record_date}`
        )
      );
      if (!propRes.error) {
        Object.values(allAttendanceRef.current).forEach((byDate) => {
          Object.entries(byDate).forEach(([dt, rec]) => {
            if (rec.pending && dt >= startDate && dt <= endDate) {
              if (!pendingKeys.has(`${rec.workerId}_${dt}`)) delete byDate[dt];
            }
          });
        });
        attRows.forEach((r: Record<string, unknown>) => {
          const wid = r.worker_id as string;
          const dt = r.record_date as string;
          if (allAttendanceRef.current[wid]?.[dt] || pendingKeys.has(`${wid}_${dt}`)) return;
          if (!allAttendanceRef.current[wid]) allAttendanceRef.current[wid] = {};
          allAttendanceRef.current[wid][dt] = {
            workerId: wid,
            recordDate: dt,
            status: r.status as string,
            absenceReason: (r.absence_reason as string) || '',
            notes: (r.notes as string) || '',
            updatedAt: (r.updated_at as string) ?? '',
            retiroHoras: Number(r.retiro_horas) || 0,
            retiroMotivo: (r.retiro_motivo as string) || '',
          };
        });
      }

      // Expose the full merged store to React state so the UI re-renders
      setAttendance({ ...allAttendanceRef.current });

      const otMap: Record<string, Record<string, OvertimeRecord>> = {};
      otRows.forEach((r: Record<string, unknown>) => {
        const wid = r.worker_id as string;
        const dt = r.record_date as string;
        if (!otMap[wid]) otMap[wid] = {};
        otMap[wid][dt] = {
          workerId: wid,
          recordDate: dt,
          hours: r.hours as number,
          notes: (r.notes as string) || '',
          pending: r.status === 'pendiente',
          proposedBy: (r.proposed_by_email as string) || '',
          approvedBy: (r.approved_by_email as string) || '',
        };
      });
      setOvertime(otMap);

      // Load locked dates (ignore errors — table may not exist yet)
      if (!lockRes.error && lockRes.data) {
        setLockRows(lockRes.data as { record_date: string; sucursal: string; area?: string }[]);
      }
    } catch (err) {
      console.error('Error loading attendance:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]); // removed `supabase` dep — it's now a stable module-level singleton

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Tras un guardado que no pisa registros ajenos (ignoreDuplicates), se descarta la copia local
  // de esas celdas y se vuelve a leer la base: así se ve lo que realmente quedó guardado.
  async function reloadFromDb(rows: { worker_id: string; record_date: string }[]) {
    rows.forEach((r) => {
      if (allAttendanceRef.current[r.worker_id])
        delete allAttendanceRef.current[r.worker_id][r.record_date];
    });
    await loadData();
  }

  // Get workers with scheduled shift on a date (excludes descanso and special days)
  function getWorkersForDate(dateStr: string) {
    return filteredWorkers
      .filter((w) => {
        const shiftCode = getShiftForDate(w.id, dateStr);
        const special = getSpecialForDate(w.id, dateStr);
        return shiftCode && shiftCode !== 'DESC' && !special;
      })
      .map((w) => ({
        id: w.id,
        name: w.name,
        initials: w.initials,
        avatarColor: w.avatarColor,
        scheduledShift: getShiftForDate(w.id, dateStr),
      }));
  }

  // Determine auto-status from schedule/special days for a given date
  // Returns the status code if the worker is NOT working that day, null if they have a real shift
  function getAutoStatus(workerId: string, dateStr: string): string | null {
    const special = getSpecialForDate(workerId, dateStr);
    if (special) {
      // NT in special days = "No trabajaba" — absolute, never overrideable
      if (special === 'NT') return 'NT';
      if (special === 'FERIADO') return 'DESCANSO';
      const knownAttendanceCodes = ATTENDANCE_STATUSES.map((s) => s.code);
      // If the special day type is a known attendance status, use it directly
      if (knownAttendanceCodes.includes(special)) return special;
      // Unknown/custom special day type → treat as NT (worker is not working)
      return 'NT';
    }
    const shiftCode = getShiftForDate(workerId, dateStr);
    if (shiftCode === 'DESC') return 'DESCANSO';
    // 'NOT' shift code in schedule = "No trabajaba" — absolute
    if (shiftCode === 'NOT') return 'NT';
    if (shiftCode === null) return 'NT_SOFT'; // soft NT — no shift assigned, can be overridden
    // If the shift code is not in the shifts registry (unknown/deleted shift), treat as NT_SOFT
    if (!shifts[shiftCode]) return 'NT_SOFT';
    return null; // worker has a real shift → no auto status
  }

  // Returns true if the worker is hard-locked to NT by the Malla (cannot be changed)
  function isMallaNT(workerId: string, dateStr: string): boolean {
    const special = getSpecialForDate(workerId, dateStr);
    if (special) {
      // Explicit NT special day
      if (special === 'NT') return true;
      // Any special day type that is NOT a known attendance status and NOT FERIADO/DESCANSO
      // means the worker is "not working" — treat as NT
      const knownAttendanceCodes = ATTENDANCE_STATUSES.map((s) => s.code);
      const isKnownStatus = knownAttendanceCodes.includes(special);
      const isKnownNonWorking = special === 'FERIADO' || special === 'DESCANSO';
      if (!isKnownStatus && !isKnownNonWorking) return true;
      return false;
    }
    // Check shift code — 'NOT' shift code also means NT
    const shiftCode = getShiftForDate(workerId, dateStr);
    if (shiftCode === 'NOT') return true;
    return false;
  }

  // Las jefas de caja (nivel asistencia) marcan "por aprobar". Si un día ya tiene algo por
  // aprobar, lo que corrija la administradora también queda ahí hasta que lo apruebe.
  function usesProposals(dateStr: string): boolean {
    if (isAsistencia) return true;
    return Object.values(attendance).some((byDate) => byDate[dateStr]?.pending);
  }
  function attendanceTable(dateStr: string) {
    return usesProposals(dateStr) ? 'attendance_proposals' : 'attendance_records';
  }

  function getEffectiveStatus(workerId: string, dateStr: string): string {
    // NT from Malla is ABSOLUTE — always wins, no DB record can override it
    if (isMallaNT(workerId, dateStr)) return 'NT';

    // Check DB record first — manual saves always take priority over auto-status
    const recorded = attendance[workerId]?.[dateStr]?.status;
    if (recorded) return recorded;

    // No DB record — fall back to auto status from schedule/special days
    const auto = getAutoStatus(workerId, dateStr);
    if (auto === 'NT_SOFT') return 'NT';
    return auto ?? 'PRESENTE';
  }

  // Open daily alert for a date
  function openDailyAlert(dateStr: string) {
    if (!canMarkAttendance || !periodReady) return;
    const { day, dow, monthShort } = formatDateLabel(dateStr);
    const workersForDate = getWorkersForDate(dateStr);
    if (workersForDate.length === 0) return;
    setDailyAlert({
      date: dateStr,
      dateLabel: `${dow} ${day} ${monthShort}`,
      workers: workersForDate,
    });
  }

  // ── Asistencia por aprobar (marcada por jefas de caja) ────────────────────
  // Por día: cuántas trabajadoras (de las que se ven) tienen algo por aprobar y quién lo marcó
  const pendingByDate = useMemo(() => {
    const out: Record<string, { count: number; by: string[] }> = {};
    for (const w of filteredWorkers) {
      const byDate = attendance[w.id];
      for (const [dt, rec] of Object.entries(byDate ?? {})) {
        if (!rec.pending || dt < startDate || dt > endDate) continue;
        if (!out[dt]) out[dt] = { count: 0, by: [] };
        out[dt].count++;
        if (rec.proposedBy && !out[dt].by.includes(rec.proposedBy)) out[dt].by.push(rec.proposedBy);
      }
      // Horas extra por aprobar
      for (const [dt, ot] of Object.entries(overtime[w.id] ?? {})) {
        if (!ot.pending || dt < startDate || dt > endDate) continue;
        if (!out[dt]) out[dt] = { count: 0, by: [] };
        if (!byDate?.[dt]?.pending) out[dt].count++;
        if (ot.proposedBy && !out[dt].by.includes(ot.proposedBy)) out[dt].by.push(ot.proposedBy);
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendance, overtime, filteredWorkers.map((w) => w.id).join(','), startDate, endDate]);
  const [approving, setApproving] = useState<string | null>(null);

  // Aprobar: lo marcado pasa a la asistencia oficial y el día queda bloqueado
  async function approveDay(dateStr: string) {
    if (!canApprove && !canApproveOvertime) return;
    setApproving(dateStr);
    const { data, error } = await supabase.rpc('approve_attendance_day', { p_date: dateStr });
    setApproving(null);
    if (error) {
      console.error('Error approving attendance:', error);
      setSaveError(`No se pudo aprobar: ${error.message}`);
      setTimeout(() => setSaveError(null), 6000);
      return;
    }
    setSaveNotice(
      `Aprobado: ${Number(data) || 0} registro(s) de asistencia y horas extra. El día quedó bloqueado.`
    );
    setTimeout(() => setSaveNotice(null), 5000);
    await loadData();
  }

  // ── Lock / Unlock day ─────────────────────────────────────────────────────
  function openLockModal(dateStr: string) {
    const { day, dow, monthShort } = formatDateLabel(dateStr);
    const label = `${dow} ${day} ${monthShort}`;
    setLockError('');
    if (!canApprove) return;
    if (!lockSucursal || lockArea === null) {
      setSaveError(
        lockSucursal
          ? 'Elige un área en los filtros para bloquear o desbloquear días.'
          : 'Elige una sola sucursal en los filtros para bloquear o desbloquear días.'
      );
      setTimeout(() => setSaveError(null), 5000);
      return;
    }
    setLockModal({
      date: dateStr,
      dateLabel: label,
      // Igual que lo que se ve: si el día aparece bloqueado, el botón lo desbloquea
      mode: lockedDates.has(dateStr) ? 'unlock' : 'lock',
    });
  }

  async function handleLockConfirm() {
    if (!lockModal) return;
    const { date, mode } = lockModal;
    const ok = mode === 'lock' ? await lockDate(date) : await unlockDate(date);
    if (ok) {
      setLockModal(null);
      setLockError('');
    } else {
      setLockError('No se pudo guardar el cambio. Intenta de nuevo.');
    }
  }

  async function lockDate(dateStr: string): Promise<boolean> {
    if (!lockSucursal || lockArea === null) return false;
    const { error } = await supabase.from('attendance_locked_dates').upsert(
      {
        record_date: dateStr,
        sucursal: lockSucursal,
        area: lockArea,
        locked_at: new Date().toISOString(),
      },
      { onConflict: 'record_date,sucursal,area' }
    );
    if (error) {
      console.error('Error locking date:', error);
      return false;
    }
    setLockRows((prev) => [
      ...prev,
      { record_date: dateStr, sucursal: lockSucursal, area: lockArea },
    ]);
    return true;
  }

  async function unlockDate(dateStr: string): Promise<boolean> {
    if (!lockSucursal || lockArea === null) return false;
    // Al aprobar el día se bloquea por área. Quien maneja la sucursal completa quita su
    // bloqueo y el del área que está viendo (o el de todas las áreas, si ve todas).
    const areas = canManageSucursal
      ? filterArea !== 'Todas'
        ? ['', filterArea]
        : [
            ...new Set(
              lockRows
                .filter((r) => r.record_date === dateStr && r.sucursal === lockSucursal)
                .map((r) => r.area ?? '')
            ),
            '',
          ]
      : [lockArea];
    const { error } = await supabase
      .from('attendance_locked_dates')
      .delete()
      .eq('record_date', dateStr)
      .eq('sucursal', lockSucursal)
      .in('area', areas);
    if (error) {
      console.error('Error unlocking date:', error);
      return false;
    }
    setLockRows((prev) =>
      prev.filter(
        (r) =>
          !(
            r.record_date === dateStr &&
            r.sucursal === lockSucursal &&
            areas.includes(r.area ?? '')
          )
      )
    );
    return true;
  }

  // "Todas asistieron": aplica la Malla de ese día a todos los trabajadores filtrados.
  // - Con turno → Presente.  - Descanso/Feriado → Descanso.
  // - Licencia, vacaciones, permiso, cumpleaños → ese mismo estado.
  // - Sin nada en la Malla → No trabajaba, salvo que ya tenga un registro hecho a mano
  //   (p. ej. vino a cubrir), que se respeta.
  async function markAllPresent(dateStr: string) {
    if (isPanelLocked || !periodReady) return;
    if (lockedDates.has(dateStr)) return;
    setMarkingAll(true);
    setSavingDate(dateStr);
    const now = new Date().toISOString();
    const table = attendanceTable(dateStr);
    const pending = table === 'attendance_proposals';

    const fromMalla = (w: { id: string }) => {
      const autoStatus = getAutoStatus(w.id, dateStr);
      return autoStatus === null ? 'PRESENTE' : autoStatus;
    };
    const allUpserts = filteredWorkers
      .filter((w) => !(fromMalla(w) === 'NT_SOFT' && attendance[w.id]?.[dateStr]))
      .map((w) => {
        const malla = fromMalla(w);
        const status = malla === 'NT_SOFT' ? 'NT' : malla;
        return {
          worker_id: w.id,
          record_date: dateStr,
          period_key: periodKey,
          status,
          absence_reason: '',
          notes: '',
          updated_at: now,
        };
      });

    // Optimistic update
    setAttendance((prev) => {
      const next = { ...prev };
      allUpserts.forEach((u) => {
        if (!next[u.worker_id]) next[u.worker_id] = {};
        const record: AttendanceRecord = {
          workerId: u.worker_id,
          recordDate: u.record_date,
          status: u.status,
          absenceReason: '',
          notes: '',
          updatedAt: u.updated_at,
          retiroHoras: prev[u.worker_id]?.[u.record_date]?.retiroHoras,
          retiroMotivo: prev[u.worker_id]?.[u.record_date]?.retiroMotivo,
          pending,
          proposedBy: pending ? prev[u.worker_id]?.[u.record_date]?.proposedBy : undefined,
        };
        next[u.worker_id][u.record_date] = record;
        if (!allAttendanceRef.current[u.worker_id]) allAttendanceRef.current[u.worker_id] = {};
        allAttendanceRef.current[u.worker_id][u.record_date] = record;
      });
      return next;
    });

    try {
      if (allUpserts.length > 0) {
        const { error } = await supabase
          .from(table)
          .upsert(allUpserts, { onConflict: 'worker_id,record_date' });
        if (error) {
          console.error('Error marking all present:', error);
          setSaveError(`Error al guardar: ${error.message}`);
          setTimeout(() => setSaveError(null), 5000);
          await reloadFromDb(allUpserts);
        } else {
          setSaveNotice(
            `Asistencia del día marcada según la Malla (${allUpserts.length} trabajador(es)).`
          );
          setTimeout(() => setSaveNotice(null), 4000);
        }
      }
    } catch (err) {
      console.error('Error marking all present:', err);
      setSaveError('Error al guardar. Intenta de nuevo.');
      setTimeout(() => setSaveError(null), 5000);
      await reloadFromDb(allUpserts);
    } finally {
      setMarkingAll(false);
      setSavingDate(null);
    }
  }

  // Handle daily alert confirm
  async function handleDailyAlertConfirm(
    allPresent: boolean,
    absences: { workerId: string; reason: string }[]
  ) {
    if (!dailyAlert) return;
    const { date } = dailyAlert;
    const table = attendanceTable(date);
    const pending = table === 'attendance_proposals';
    if (isPanelLocked || lockedDates.has(date)) {
      setDailyAlert(null);
      return;
    }
    setSavingDate(date);
    setDailyAlert(null);

    const workersForDate = getWorkersForDate(date);
    const absentSet = new Set(absences.map((a) => a.workerId));
    const absenceReasonMap = Object.fromEntries(absences.map((a) => [a.workerId, a.reason]));

    const upserts = workersForDate.map((w) => {
      const reason = absentSet.has(w.id) ? absenceReasonMap[w.id] || 'Falta injustificada' : '';
      // "Falta justificada", licencia, permisos y vacaciones se guardan con su propio estado
      const ownStatus = ABSENCE_REASON_STATUS[reason];
      return {
        worker_id: w.id,
        record_date: date,
        period_key: periodKey,
        status: !absentSet.has(w.id) ? 'PRESENTE' : (ownStatus ?? 'AUSENTE'),
        absence_reason: ownStatus ? '' : reason,
        notes: '',
        updated_at: new Date().toISOString(),
      };
    });

    // Estados automáticos (descanso, no trabaja…) solo para quienes aún no tienen registro:
    // no se pisa, por ejemplo, a alguien sin turno que vino a cubrir y ya fue marcado presente.
    const autoUpserts = filteredWorkers
      .filter((w) => !workersForDate.find((wf) => wf.id === w.id))
      .filter((w) => !attendance[w.id]?.[date])
      .map((w) => {
        const autoStatus = getAutoStatus(w.id, date);
        if (!autoStatus) return null;
        return {
          worker_id: w.id,
          record_date: date,
          period_key: periodKey,
          status: autoStatus === 'NT_SOFT' ? 'NT' : autoStatus,
          absence_reason: '',
          notes: '',
          updated_at: new Date().toISOString(),
        };
      })
      .filter((u): u is NonNullable<typeof u> => u !== null);

    const allUpserts = [...upserts, ...autoUpserts];

    // Apply optimistic update immediately — do NOT call loadData() after save
    // (loadData can race with DB commit and overwrite the just-saved state)
    setAttendance((prev) => {
      const next = { ...prev };
      allUpserts.forEach((u) => {
        if (!u) return;
        if (!next[u.worker_id]) next[u.worker_id] = {};
        const record: AttendanceRecord = {
          workerId: u.worker_id,
          recordDate: u.record_date,
          status: u.status,
          absenceReason: u.absence_reason,
          notes: u.notes,
          updatedAt: u.updated_at,
          retiroHoras: prev[u.worker_id]?.[u.record_date]?.retiroHoras,
          retiroMotivo: prev[u.worker_id]?.[u.record_date]?.retiroMotivo,
          pending,
          proposedBy: pending ? prev[u.worker_id]?.[u.record_date]?.proposedBy : undefined,
        };
        next[u.worker_id][u.record_date] = record;
        // Keep persistent ref in sync so loadData never overwrites this
        if (!allAttendanceRef.current[u.worker_id]) allAttendanceRef.current[u.worker_id] = {};
        allAttendanceRef.current[u.worker_id][u.record_date] = record;
      });
      return next;
    });

    try {
      const [confirmed, auto] = await Promise.all([
        upserts.length > 0
          ? supabase.from(table).upsert(upserts, { onConflict: 'worker_id,record_date' })
          : Promise.resolve({ error: null }),
        autoUpserts.length > 0
          ? supabase
              .from(table)
              .upsert(autoUpserts, { onConflict: 'worker_id,record_date', ignoreDuplicates: true })
          : Promise.resolve({ error: null }),
      ]);
      const error = confirmed.error || auto.error;
      if (autoUpserts.length > 0 || error) await reloadFromDb(error ? allUpserts : autoUpserts);
      if (error) {
        console.error('Error saving attendance:', error);
        setSaveError(`Error al guardar: ${error.message}`);
        setTimeout(() => setSaveError(null), 5000);
        // Revert optimistic update on confirmed DB error
      }
    } catch (err) {
      console.error('Error saving attendance:', err);
      setSaveError('Error al guardar el estado. Intenta de nuevo.');
      setTimeout(() => setSaveError(null), 5000);
    } finally {
      setSavingDate(null);
    }
  }

  // Change single worker status
  async function changeStatus(workerId: string, dateStr: string, newStatus: string) {
    if (isPanelLocked) return;
    if (lockedDates.has(dateStr)) return;
    if (isMallaNT(workerId, dateStr)) return;

    const cellKey = `${workerId}_${dateStr}`;
    const table = attendanceTable(dateStr);
    const pending = table === 'attendance_proposals';

    // Capture previous state for rollback
    const prevRecord = attendance[workerId]?.[dateStr];

    // Apply optimistic update immediately
    setAttendance((prev) => {
      const next = { ...prev };
      if (!next[workerId]) next[workerId] = {};
      const now = new Date().toISOString();
      const record: AttendanceRecord = {
        workerId,
        recordDate: dateStr,
        status: newStatus,
        absenceReason: newStatus === 'AUSENTE' ? 'Falta injustificada' : '',
        notes: '',
        updatedAt: now,
        retiroHoras: prev[workerId]?.[dateStr]?.retiroHoras,
        retiroMotivo: prev[workerId]?.[dateStr]?.retiroMotivo,
        pending,
        proposedBy: pending ? prev[workerId]?.[dateStr]?.proposedBy : undefined,
      };
      next[workerId][dateStr] = record;
      // Keep persistent ref in sync so loadData never overwrites this optimistic update
      if (!allAttendanceRef.current[workerId]) allAttendanceRef.current[workerId] = {};
      allAttendanceRef.current[workerId][dateStr] = record;
      return next;
    });

    setSavingCells((prev) => new Set([...prev, cellKey]));

    try {
      const { error } = await supabase.from(table).upsert(
        {
          worker_id: workerId,
          record_date: dateStr,
          period_key: periodKey,
          status: newStatus,
          absence_reason: newStatus === 'AUSENTE' ? 'Falta injustificada' : '',
          notes: '',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'worker_id,record_date' }
      );

      if (error) {
        console.error('Error saving status:', error);
        setSaveError(`Error al guardar: ${error.message}`);
        setTimeout(() => setSaveError(null), 5000);
        // Revert optimistic update
        setAttendance((prev) => {
          const next = { ...prev };
          if (prevRecord) {
            if (!next[workerId]) next[workerId] = {};
            next[workerId][dateStr] = prevRecord;
          } else {
            if (next[workerId]) delete next[workerId][dateStr];
          }
          return next;
        });
      }
    } catch (err) {
      console.error('Error saving status (exception):', err);
      setSaveError('Error al guardar el estado. Intenta de nuevo.');
      setTimeout(() => setSaveError(null), 5000);
      // Revert optimistic update
      setAttendance((prev) => {
        const next = { ...prev };
        if (prevRecord) {
          if (!next[workerId]) next[workerId] = {};
          next[workerId][dateStr] = prevRecord;
        } else {
          if (next[workerId]) delete next[workerId][dateStr];
        }
        return next;
      });
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  }

  // Save overtime
  async function saveOvertime(workerId: string, dateStr: string, hours: number, notes: string) {
    if (isPanelLocked) return;
    if (lockedDates.has(dateStr)) return;
    const upsert = {
      worker_id: workerId,
      record_date: dateStr,
      period_key: periodKey,
      hours,
      notes,
      updated_at: new Date().toISOString(),
    };
    const myEmail = user?.email ?? '';
    setOvertime((prev) => {
      const next = { ...prev };
      if (!next[workerId]) next[workerId] = {};
      next[workerId][dateStr] = {
        workerId,
        recordDate: dateStr,
        hours,
        notes,
        pending: !canApproveOvertime,
        proposedBy: myEmail,
        approvedBy: canApproveOvertime ? myEmail : '',
      };
      return next;
    });
    setOvertimeModal(null);
    const { error } = await supabase
      .from('overtime_hours')
      .upsert(upsert, { onConflict: 'worker_id,record_date' });
    if (error) {
      console.error('Error saving overtime:', error);
      setSaveError(`No se pudieron guardar las horas extra: ${error.message}`);
      setTimeout(() => setSaveError(null), 5000);
    }
  }

  // Retiro anticipado: horas a descontar de ese día (0 = sin retiro)
  async function saveRetiro(workerId: string, dateStr: string, hours: number, reason: string) {
    if (isPanelLocked || lockedDates.has(dateStr)) return;
    setRetiroModal(null);
    const prevRecord = attendance[workerId]?.[dateStr];
    const status = getEffectiveStatus(workerId, dateStr);
    const now = new Date().toISOString();
    const table = attendanceTable(dateStr);
    const pending = table === 'attendance_proposals';
    const record: AttendanceRecord = {
      workerId,
      recordDate: dateStr,
      status,
      absenceReason: prevRecord?.absenceReason ?? '',
      notes: prevRecord?.notes ?? '',
      updatedAt: now,
      retiroHoras: hours,
      retiroMotivo: reason,
      pending,
      proposedBy: pending ? prevRecord?.proposedBy : undefined,
    };
    setAttendance((prev) => ({
      ...prev,
      [workerId]: { ...(prev[workerId] || {}), [dateStr]: record },
    }));
    if (!allAttendanceRef.current[workerId]) allAttendanceRef.current[workerId] = {};
    allAttendanceRef.current[workerId][dateStr] = record;

    // Si no había registro, se crea con el estado que se ve; si había, se conserva el resto
    const { error } = await supabase.from(table).upsert(
      {
        worker_id: workerId,
        record_date: dateStr,
        period_key: periodKey,
        status,
        retiro_horas: hours,
        retiro_motivo: reason,
        updated_at: now,
      },
      { onConflict: 'worker_id,record_date' }
    );
    if (error) {
      console.error('Error saving retiro:', error);
      setSaveError(`No se pudo guardar el retiro: ${error.message}`);
      setTimeout(() => setSaveError(null), 5000);
      await reloadFromDb([{ worker_id: workerId, record_date: dateStr }]);
    }
  }

  // Guarda el estado que se ve en pantalla para los días que aún no tienen registro.
  // - Solo hasta hoy: no se marca asistencia de días que todavía no ocurren.
  // - Nunca pisa registros existentes (ignoreDuplicates), aunque otra persona los haya
  //   cambiado después de que esta pantalla se cargó.
  async function saveReport() {
    if (filteredWorkers.length === 0 || dates.length === 0) return;
    const today = getTodayStr();
    const now = new Date().toISOString();
    const upserts = [];
    for (const w of filteredWorkers) {
      for (const dt of dates) {
        if (dt > today) continue;
        if (lockedDates.has(dt)) continue; // los días bloqueados no se pueden modificar
        if (attendance[w.id]?.[dt]) continue; // ya está guardado
        const status = getEffectiveStatus(w.id, dt);
        if (status === 'NT') continue; // don't save hard NT records
        upserts.push({
          worker_id: w.id,
          record_date: dt,
          period_key: periodKey,
          status,
          absence_reason: '',
          notes: '',
          updated_at: now,
        });
      }
    }
    if (upserts.length === 0) {
      setSaveNotice('No había días pendientes por guardar.');
      setTimeout(() => setSaveNotice(null), 4000);
      return;
    }
    const { error } = await supabase
      .from('attendance_records')
      .upsert(upserts, { onConflict: 'worker_id,record_date', ignoreDuplicates: true });
    if (error) {
      console.error('Error saving report:', error);
      setSaveError(`Error al guardar: ${error.message}`);
      setTimeout(() => setSaveError(null), 5000);
      return;
    }
    await loadData();
    setSaveNotice(`Reporte guardado: ${upserts.length} registro(s) pendiente(s) hasta hoy.`);
    setTimeout(() => setSaveNotice(null), 4000);
  }

  // Chilean public holidays (fixed + moveable approximations)
  function isChileanHoliday(dateStr: string): boolean {
    const [year, month, day] = dateStr.split('-').map(Number);
    const fixed: [number, number][] = [
      [1, 1],
      [5, 1],
      [5, 21],
      [6, 29],
      [7, 16],
      [8, 15],
      [9, 18],
      [9, 19],
      [10, 12],
      [10, 31],
      [11, 1],
      [11, 2],
      [12, 8],
      [12, 25],
    ];
    if (fixed.some(([m, d]) => m === month && d === day)) return true;
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d2 = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d2 - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m2 = Math.floor((a + 11 * h + 22 * l) / 451);
    const easterMonth = Math.floor((h + l - 7 * m2 + 114) / 31);
    const easterDay = ((h + l - 7 * m2 + 114) % 31) + 1;
    const easter = new Date(year, easterMonth - 1, easterDay);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    const holySaturday = new Date(easter);
    holySaturday.setDate(easter.getDate() - 1);
    if (goodFriday.getMonth() + 1 === month && goodFriday.getDate() === day) return true;
    if (holySaturday.getMonth() + 1 === month && holySaturday.getDate() === day) return true;
    return false;
  }

  // Export to Excel — polished professional layout using ExcelJS
  async function exportToExcel() {
    const ExcelJS = (await import('exceljs')).default;

    // Fresh DB fetch
    const freshAttendance: Record<string, Record<string, AttendanceRecord>> = {};
    try {
      const attRows = await fetchAll((from, to) =>
        supabase
          .from('attendance_records')
          .select('*')
          .gte('record_date', startDate)
          .lte('record_date', endDate)
          .order('id')
          .range(from, to)
      );

      attRows.forEach((r: Record<string, unknown>) => {
        const wid = r.worker_id as string;
        const dt = r.record_date as string;
        if (!freshAttendance[wid]) freshAttendance[wid] = {};
        freshAttendance[wid][dt] = {
          workerId: wid,
          recordDate: dt,
          status: r.status as string,
          absenceReason: (r.absence_reason as string) || '',
          notes: (r.notes as string) || '',
          retiroHoras: Number(r.retiro_horas) || 0,
          retiroMotivo: (r.retiro_motivo as string) || '',
        };
      });
    } catch (err) {
      console.error('Error fetching attendance for export:', err);
    }

    // Merge in-memory state (DB takes priority)
    Object.entries(attendance).forEach(([wid, dateMap]) => {
      Object.entries(dateMap).forEach(([dt, rec]) => {
        if (!freshAttendance[wid]) freshAttendance[wid] = {};
        if (!freshAttendance[wid][dt]) {
          freshAttendance[wid][dt] = rec;
        }
      });
    });

    const STATUS_LABEL_MAP: Record<string, string> = {
      PRESENTE: 'Presente',
      AUSENTE: 'Falta injustificada',
      FALTA_JUSTIFICADA: 'Falta justificada',
      VACACIONES: 'Vacaciones',
      DESCANSO: 'Descanso',
      PERMISO: 'Permiso',
      PERMISO_CG: 'Permiso con goce',
      PERMISO_SG: 'Permiso sin goce',
      LICENCIA: 'Licencia',
      CUMPLEANOS: 'Cumpleaños',
      NT: 'No trabajaba',
    };

    // Letras iguales a las de la app (resumen del período)
    const STATUS_LETTER: Record<string, string> = {
      PRESENTE: 'P',
      AUSENTE: 'F',
      FALTA_JUSTIFICADA: 'J',
      DESCANSO: 'D',
      NT: '-',
      LICENCIA: 'L',
      PERMISO: 'M',
      PERMISO_CG: 'M',
      PERMISO_SG: 'S',
      VACACIONES: 'V',
      CUMPLEANOS: 'C',
    };

    // Report status: DB record first, then effective status (malla-derived)
    // This ensures every cell shows something — no blank cells for workers with shifts
    function getReportStatus(workerId: string, dateStr: string): string {
      const recorded = freshAttendance[workerId]?.[dateStr]?.status;
      if (recorded) return recorded;
      // No DB record — use effective status (handles DESCANSO, NT, real shift → PRESENTE)
      return getEffectiveStatus(workerId, dateStr);
    }

    function getCellDisplayValue(workerId: string, dateStr: string): string {
      const status = getReportStatus(workerId, dateStr);
      if (!status) return '';
      if (status === 'AUSENTE') {
        const reason = freshAttendance[workerId]?.[dateStr]?.absenceReason;
        if (reason && reason.trim()) return `Falta injustificada - ${reason.trim()}`;
        return 'Falta injustificada';
      }
      return STATUS_LABEL_MAP[status] ?? status;
    }

    const argb = (hex: string) => `FF${hex.toUpperCase()}`;
    const thinBorder = {
      top: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin' as const, color: { argb: 'FFBFBFBF' } },
    };

    const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
      PRESENTE: { bg: 'E2EFDA', fg: '375623' },
      AUSENTE: { bg: 'FCE4D6', fg: '843C0C' },
      FALTA_JUSTIFICADA: { bg: 'FFF2CC', fg: '7F6000' },
      DESCANSO: { bg: 'DDEBF7', fg: '1F4E79' },
      NT: { bg: 'F2F2F2', fg: '808080' },
      VACACIONES: { bg: 'C9DAF8', fg: '1C4587' },
      PERMISO: { bg: 'EDE7F6', fg: '4A148C' },
      PERMISO_CG: { bg: 'E0F2F1', fg: '004D40' },
      PERMISO_SG: { bg: 'FFE0B2', fg: 'E65100' },
      LICENCIA: { bg: 'FBE9E7', fg: 'BF360C' },
      CUMPLEANOS: { bg: 'FCE4EC', fg: '880E4F' },
    };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'DL Gestor';
    wb.created = new Date();

    const ws = wb.addWorksheet('Asistencia', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: 6 }],
    });

    const reportWorkers = filteredWorkers;
    const FIXED_COLS = 3;
    const TOTAL_LABELS = [
      'Presentes',
      'Faltas injust.',
      'Faltas just.',
      'Descansos',
      'Vacaciones',
      'Permisos',
      'Licencias',
      'Hrs. descontadas',
      'Horas extra',
      'HE por aprobar',
    ];
    // RETIRO = suma de horas descontadas por retiro anticipado
    const TOTAL_KEYS = [
      'PRESENTE',
      'AUSENTE',
      'FALTA_JUSTIFICADA',
      'DESCANSO',
      'VACACIONES',
      'PERMISO',
      'LICENCIA',
      'RETIRO',
      'HE',
      'HE_PEND',
    ];
    const totalCols = FIXED_COLS + dates.length + TOTAL_LABELS.length;

    ws.getColumn(1).width = 32;
    ws.getColumn(2).width = 18;
    ws.getColumn(3).width = 18;
    dates.forEach((_, i) => {
      ws.getColumn(FIXED_COLS + 1 + i).width = 6.5;
    });
    TOTAL_LABELS.forEach((_, i) => {
      ws.getColumn(FIXED_COLS + dates.length + 1 + i).width = 11;
    });

    ws.getRow(1).height = 36;
    ws.mergeCells(1, 1, 1, totalCols);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = 'CONTROL DE ASISTENCIA';
    titleCell.font = { bold: true, size: 18, color: { argb: argb('FFFFFF') } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('1F4E79') } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    ws.getRow(2).height = 6;

    const fmtDate = (iso: string) => iso.split('-').reverse().join('-');
    const periodStr = `${fmtDate(startDate)} al ${fmtDate(endDate)}`;
    const sucStr = filterSucursal.length > 0 ? filterSucursal.join(', ') : 'Todas';
    const areaStr = filterArea !== 'Todas' ? filterArea : 'Todas';
    const now2 = new Date();
    const genStr = `${String(now2.getDate()).padStart(2, '0')}-${String(now2.getMonth() + 1).padStart(2, '0')}-${now2.getFullYear()}`;

    const infoFill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: argb('D6E4F0') },
    };
    const infoLabelFont = { bold: true, color: { argb: argb('1F4E79') } };

    ws.getRow(3).height = 18;
    ws.getRow(4).height = 18;

    const setInfoCell = (
      row: number,
      col: number,
      val: string | number,
      isLabel: boolean,
      toCol = col
    ) => {
      if (toCol > col) ws.mergeCells(row, col, row, toCol);
      const cell = ws.getCell(row, col);
      cell.value = val;
      cell.fill = infoFill;
      cell.font = isLabel ? infoLabelFont : { color: { argb: argb('000000') } };
      cell.alignment = { horizontal: isLabel ? 'right' : 'left', vertical: 'middle' };
      cell.border = thinBorder;
    };

    // Los datos van en las columnas anchas; a la derecha, unidos sobre las columnas de días
    const infoEnd = Math.min(totalCols, FIXED_COLS + Math.max(dates.length, 10));
    setInfoCell(3, 1, 'Período:', true);
    setInfoCell(3, 2, periodStr, false, 3);
    setInfoCell(
      3,
      FIXED_COLS + 1,
      `Área: ${areaStr}   ·   Trabajadoras: ${reportWorkers.length}`,
      false,
      infoEnd
    );
    setInfoCell(4, 1, 'Sucursal:', true);
    setInfoCell(4, 2, sucStr, false, 3);
    setInfoCell(4, FIXED_COLS + 1, `Generado: ${genStr}`, false, infoEnd);

    ws.getRow(5).height = 6;
    ws.getRow(6).height = 22;

    const setHeaderCell = (col: number, val: string, bgHex: string) => {
      const cell = ws.getCell(6, col);
      cell.value = val;
      cell.font = { bold: true, size: 10, color: { argb: argb('FFFFFF') } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(bgHex) } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    };

    setHeaderCell(1, 'APELLIDOS Y NOMBRES', '1F4E79');
    setHeaderCell(2, 'ÁREA', '1F4E79');
    setHeaderCell(3, 'SUCURSAL', '1F4E79');

    dates.forEach((dt, i) => {
      const [, m, d] = dt.split('-');
      const dayDate = new Date(dt + 'T12:00:00');
      const dow = dayDate.getDay();
      const isSunday = dow === 0;
      const isHoliday = isChileanHoliday(dt);
      const colNum = FIXED_COLS + 1 + i;
      const cell = ws.getCell(6, colNum);
      cell.value = `${d}/${m}`;
      cell.font = { bold: true, size: 9, color: { argb: argb('FFFFFF') } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isHoliday ? argb('C00000') : isSunday ? argb('E36C09') : argb('2E75B6') },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });

    TOTAL_LABELS.forEach((lbl, i) => {
      const colNum = FIXED_COLS + dates.length + 1 + i;
      const cell = ws.getCell(6, colNum);
      cell.value = lbl;
      cell.font = { bold: true, size: 9, color: { argb: argb('FFFFFF') } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('595959') } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });

    reportWorkers.forEach((w, rowIdx) => {
      const excelRow = 7 + rowIdx;
      ws.getRow(excelRow).height = 18;
      const isAlt = rowIdx % 2 === 1;
      const rowBgHex = isAlt ? 'F7FBFF' : 'FFFFFF';
      let rowHasExtras = false;

      const fixedStyle = {
        fill: {
          type: 'pattern' as const,
          pattern: 'solid' as const,
          fgColor: { argb: argb(rowBgHex) },
        },
        alignment: { horizontal: 'left' as const, vertical: 'middle' as const },
        border: thinBorder,
        font: { size: 10 },
      };
      const nameCell = ws.getCell(excelRow, 1);
      nameCell.value = w.name;
      Object.assign(nameCell, fixedStyle);
      const areaCell = ws.getCell(excelRow, 2);
      areaCell.value = w.area;
      Object.assign(areaCell, fixedStyle);
      const sucCell = ws.getCell(excelRow, 3);
      sucCell.value = w.sucursal;
      Object.assign(sucCell, fixedStyle);

      const counts: Record<string, number> = {
        PRESENTE: 0,
        AUSENTE: 0,
        FALTA_JUSTIFICADA: 0,
        DESCANSO: 0,
        VACACIONES: 0,
        PERMISO: 0,
        LICENCIA: 0,
        RETIRO: 0,
        HE: 0,
        HE_PEND: 0,
      };

      dates.forEach((dt, i) => {
        const status = getReportStatus(w.id, dt);
        // Permiso con goce / sin goce se suman en la columna "Permisos"
        const bucket = status?.startsWith('PERMISO') ? 'PERMISO' : status;
        if (bucket && counts[bucket] !== undefined) counts[bucket]++;
        const retiro = freshAttendance[w.id]?.[dt]?.retiroHoras ?? 0;
        counts.RETIRO += retiro;
        const ot = overtime[w.id]?.[dt];
        const he = ot?.hours ?? 0;
        if (he > 0) counts[ot?.pending ? 'HE_PEND' : 'HE'] += he;
        // Letra del estado y, debajo, horas extra (+2h, * = por aprobar) o retiro (-1h)
        const extras = [
          he > 0 ? `+${he}h${ot?.pending ? '*' : ''}` : '',
          retiro > 0 ? `-${retiro}h` : '',
        ].filter(Boolean);
        if (extras.length > 0) rowHasExtras = true;
        const letter = status ? (STATUS_LETTER[status] ?? getCellDisplayValue(w.id, dt)) : '';
        const displayVal = [letter, ...extras].join('\n');
        const reason = freshAttendance[w.id]?.[dt]?.absenceReason?.trim();
        const colNum = FIXED_COLS + 1 + i;
        const colors = STATUS_COLORS[status] ?? { bg: rowBgHex, fg: '000000' };

        const dayDate = new Date(dt + 'T12:00:00');
        const isSunday = dayDate.getDay() === 0;
        const isHoliday = isChileanHoliday(dt);
        let cellBg = colors.bg;
        if (isHoliday) cellBg = 'FADADD';
        else if (isSunday) cellBg = 'FDE9D9';

        const cell = ws.getCell(excelRow, colNum);
        cell.value = displayVal;
        if (reason) cell.note = reason;
        cell.font = { bold: true, size: 10, color: { argb: argb(colors.fg) } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(cellBg) } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = thinBorder;
      });

      if (rowHasExtras) ws.getRow(excelRow).height = 30;

      TOTAL_KEYS.forEach((key, i) => {
        const colNum = FIXED_COLS + dates.length + 1 + i;
        const val = counts[key] ?? 0;
        const cell = ws.getCell(excelRow, colNum);
        cell.value = val;
        cell.font = {
          bold: val > 0,
          size: 10,
          color: {
            argb:
              (key === 'AUSENTE' || key === 'RETIRO') && val > 0
                ? argb('843C0C')
                : key === 'HE_PEND' && val > 0
                  ? argb('B45309')
                  : argb('000000'),
          },
        };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('F2F2F2') } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
      });
    });

    // Hoja 2: detalle de horas extra (aprobadas y por aprobar)
    const wsHE = wb.addWorksheet('Horas extra', { views: [{ state: 'frozen', ySplit: 1 }] });
    const heCols = [
      { header: 'Trabajadora', width: 32 },
      { header: 'Área', width: 16 },
      { header: 'Sucursal', width: 20 },
      { header: 'Fecha', width: 12 },
      { header: 'Horas', width: 8 },
      { header: 'Motivo', width: 30 },
      { header: 'Estado', width: 14 },
      { header: 'Anotó', width: 28 },
      { header: 'Aprobó', width: 28 },
    ];
    heCols.forEach((c, i) => {
      wsHE.getColumn(i + 1).width = c.width;
      const cell = wsHE.getCell(1, i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: argb('FFFFFF') } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('1F4E79') } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
    let heRow = 2;
    reportWorkers.forEach((w) => {
      dates.forEach((dt) => {
        const ot = overtime[w.id]?.[dt];
        if (!ot || !(ot.hours > 0)) return;
        const [y, m, d] = dt.split('-');
        const values = [
          w.name,
          w.area,
          w.sucursal,
          `${d}-${m}-${y}`,
          ot.hours,
          ot.notes || '',
          ot.pending ? 'Por aprobar' : 'Aprobada',
          ot.proposedBy || '',
          ot.pending ? '' : ot.approvedBy || '',
        ];
        values.forEach((v, i) => {
          const cell = wsHE.getCell(heRow, i + 1);
          cell.value = v;
          cell.border = thinBorder;
          cell.alignment = { vertical: 'middle', horizontal: i === 4 ? 'center' : 'left' };
          if (i === 6) {
            cell.font = { bold: true, color: { argb: argb(ot.pending ? 'B45309' : '375623') } };
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: argb(ot.pending ? 'FFF2CC' : 'E2EFDA') },
            };
          }
        });
        heRow++;
      });
    });
    if (heRow === 2) wsHE.getCell(2, 1).value = 'Sin horas extra en el período.';

    // Hoja Leyenda: las mismas letras de la app
    const wsL = wb.addWorksheet('Leyenda');
    wsL.getColumn(1).width = 10;
    wsL.getColumn(2).width = 34;

    wsL.getRow(1).height = 28;
    wsL.mergeCells(1, 1, 1, 2);
    const legTitle = wsL.getCell(1, 1);
    legTitle.value = 'LEYENDA';
    legTitle.font = { bold: true, size: 14, color: { argb: argb('FFFFFF') } };
    legTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb('1F4E79') } };
    legTitle.alignment = { horizontal: 'center', vertical: 'middle' };

    const legendRows: { sym: string; label: string; code?: string }[] = [
      { sym: 'P', label: 'Presente', code: 'PRESENTE' },
      { sym: 'F', label: 'Falta injustificada', code: 'AUSENTE' },
      { sym: 'J', label: 'Falta justificada', code: 'FALTA_JUSTIFICADA' },
      { sym: 'D', label: 'Descanso', code: 'DESCANSO' },
      { sym: '-', label: 'No trabajaba', code: 'NT' },
      { sym: 'L', label: 'Licencia', code: 'LICENCIA' },
      { sym: 'M', label: 'Permiso con goce', code: 'PERMISO_CG' },
      { sym: 'S', label: 'Permiso sin goce', code: 'PERMISO_SG' },
      { sym: 'V', label: 'Vacaciones', code: 'VACACIONES' },
      { sym: 'C', label: 'Cumpleaños', code: 'CUMPLEANOS' },
      { sym: '+2h', label: 'Horas extra aprobadas' },
      { sym: '+2h*', label: 'Horas extra por aprobar' },
      { sym: '-1h', label: 'Se retiró antes (horas descontadas)' },
      { sym: '◤', label: 'Triángulo en la celda: motivo de la falta' },
    ];
    legendRows.forEach((row, ri) => {
      const excelRow = ri + 2;
      wsL.getRow(excelRow).height = 20;
      const colors = (row.code && STATUS_COLORS[row.code]) || { bg: 'FFF2CC', fg: '7F6000' };
      const symCell = wsL.getCell(excelRow, 1);
      symCell.value = row.sym;
      symCell.font = { bold: true, size: 12, color: { argb: argb(colors.fg) } };
      symCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(colors.bg) } };
      symCell.alignment = { horizontal: 'center', vertical: 'middle' };
      symCell.border = thinBorder;
      const labelCell = wsL.getCell(excelRow, 2);
      labelCell.value = row.label;
      labelCell.alignment = { horizontal: 'left', vertical: 'middle' };
      labelCell.border = thinBorder;
    });

    // Al imprimir: horizontal y a lo ancho de una hoja
    [ws, wsHE].forEach((sheet) => {
      sheet.pageSetup = {
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      };
    });
    ws.pageSetup.printTitlesRow = '6:6';

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const areaLabel = filterArea !== 'Todas' ? `_${filterArea.replace(/\s+/g, '_')}` : '';
    const sucLabel =
      filterSucursal.length > 0
        ? `_${filterSucursal.map((s) => s.replace(/\s+/g, '_')).join('-')}`
        : '';
    a.href = url;
    a.download = `Asistencia_${startDate}_${endDate}${areaLabel}${sucLabel}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectedDateWorkers = selectedDate ? getWorkersForDate(selectedDate) : [];
  const dateRecorded = selectedDate
    ? filteredWorkers.filter((w) => attendance[w.id]?.[selectedDate]).length
    : 0;

  const sucursalesList = sucursales.map((s) => s.name);
  const areasList = [
    'Todas',
    ...Array.from(
      new Set(workers.filter((w) => w.estado === 'Activo' && w.area).map((w) => w.area))
    ).sort(),
  ];
  const cargosList = Array.from(
    new Set(workers.filter((w) => w.estado === 'Activo' && w.cargo).map((w) => w.cargo))
  ).sort();
  const activeFilterCount =
    (filterSucursal.length > 0 ? 1 : 0) +
    (filterArea !== 'Todas' ? 1 : 0) +
    (filterCargo.length > 0 ? 1 : 0) +
    (filterTurno !== 'Todos' ? 1 : 0) +
    (filterTurnoEspecifico !== 'Todos' ? 1 : 0) +
    (searchName.trim() ? 1 : 0);
  const periodLabel =
    startDate && endDate ? formatPeriodLabel(startDate, endDate) : 'Selecciona fechas';

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 lg:py-4 shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <CalendarCheck size={18} className="text-blue-600" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg leading-tight">Asistencia</h1>
              <p className="text-xs text-gray-500">{periodLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowFilters(true)}
              className="lg:hidden flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
            >
              <SlidersHorizontal size={16} />
              Filtros
              {activeFilterCount > 0 && (
                <span className="min-w-[20px] h-5 px-1 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {/* Global panel lock */}
            {!isAsistencia && (
              <LockToggle
                isLocked={isPanelLocked}
                subject={lockSucursal ? `la asistencia de ${lockSucursal}` : 'la asistencia'}
                onToggle={setPanelLocked}
                disabledReason={
                  lockSucursal ? undefined : 'Elige una sola sucursal para bloquear su asistencia'
                }
              />
            )}
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span className="hidden lg:inline">Actualizar</span>
            </button>
            {!isAsistencia && (
              <button
                onClick={saveReport}
                disabled={loading || filteredWorkers.length === 0 || !canMarkAttendance}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                <Download size={13} />
                Guardar reporte
              </button>
            )}
            {!isAsistencia && (
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors"
              >
                <Download size={13} />
                Exportar Excel
              </button>
            )}
          </div>
        </div>

        {/* Filters: en el computador van en una fila; en el celular, en un panel que sube desde abajo */}
        {showFilters && (
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowFilters(false)}
          />
        )}
        <div
          className={`${
            showFilters
              ? 'fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[calc(var(--app-height,100dvh)*0.85)] overflow-y-auto bg-white rounded-t-3xl px-4 pt-3 pb-6 shadow-2xl'
              : 'hidden'
          } lg:static lg:z-auto lg:flex lg:flex-row lg:flex-wrap lg:max-h-none lg:overflow-visible lg:bg-transparent lg:rounded-none lg:p-0 lg:shadow-none lg:mt-4 gap-3 items-stretch lg:items-center`}
        >
          <div className="lg:hidden flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Filtros</h2>
            <button
              type="button"
              onClick={() => setShowFilters(false)}
              aria-label="Cerrar filtros"
              className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 lg:py-1.5 w-full lg:w-auto">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500 shrink-0">Desde</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setSelectedDate('');
              }}
              className="flex-1 lg:flex-none text-base lg:text-xs text-gray-700 bg-transparent border-none outline-none cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 lg:py-1.5 w-full lg:w-auto">
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500 shrink-0">Hasta</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setSelectedDate('');
              }}
              className="flex-1 lg:flex-none text-base lg:text-xs text-gray-700 bg-transparent border-none outline-none cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 lg:py-1.5 w-full lg:w-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-400 shrink-0"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Buscar nombre..."
              className="flex-1 min-w-0 lg:flex-none lg:w-32 text-base lg:text-xs text-gray-700 bg-transparent border-none outline-none"
            />
            {searchName && (
              <button
                onClick={() => setSearchName('')}
                className="text-gray-400 hover:text-gray-600 shrink-0"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="relative w-full lg:w-auto">
            <MultiSelect
              options={sucursalesList}
              selected={filterSucursal}
              onChange={setFilterSucursal}
              allLabel="Todas las sucursales"
              pluralLabel="sucursales"
              emptyLabel="Sin sucursales"
            />
          </div>

          <div className="relative w-full lg:w-auto">
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="w-full lg:w-auto appearance-none pl-3 pr-8 py-3 lg:py-2 text-base lg:text-xs border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer"
            >
              {areasList.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
          </div>

          <div className="relative w-full lg:w-auto">
            <MultiSelect
              options={cargosList}
              selected={filterCargo}
              onChange={setFilterCargo}
              allLabel="Todos los cargos"
              pluralLabel="cargos"
              emptyLabel="Sin cargos"
            />
          </div>

          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1 w-full lg:w-auto">
            <button
              onClick={() => setFilterTurno('Todos')}
              className={`flex flex-1 lg:flex-none justify-center items-center gap-1 px-2.5 py-2.5 lg:py-1 rounded-lg text-sm lg:text-xs font-medium transition-colors ${filterTurno === 'Todos' ? 'bg-white text-gray-800 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterTurno('AM')}
              className={`flex flex-1 lg:flex-none justify-center items-center gap-1 px-2.5 py-2.5 lg:py-1 rounded-lg text-sm lg:text-xs font-medium transition-colors ${filterTurno === 'AM' ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Sun size={11} />
              Mañana
            </button>
            <button
              onClick={() => setFilterTurno('Tarde')}
              className={`flex flex-1 lg:flex-none justify-center items-center gap-1 px-2.5 py-2.5 lg:py-1 rounded-lg text-sm lg:text-xs font-medium transition-colors ${filterTurno === 'Tarde' ? 'bg-indigo-100 text-indigo-800 shadow-sm border border-indigo-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Sunset size={11} />
              Tarde
            </button>
          </div>

          {/* Specific shift filter */}
          {Object.keys(shifts).length > 0 && (
            <div className="relative w-full lg:w-auto">
              <select
                value={filterTurnoEspecifico}
                onChange={(e) => setFilterTurnoEspecifico(e.target.value)}
                className="w-full lg:w-auto appearance-none pl-3 pr-8 py-3 lg:py-2 text-base lg:text-xs border border-gray-200 rounded-xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300 cursor-pointer"
              >
                <option value="Todos">Todos los turnos</option>
                {Object.values(shifts)
                  .filter((s) => s.code !== 'DESC')
                  .map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label} ({s.start}–{s.end})
                    </option>
                  ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          )}

          <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
            <Users size={13} />
            <span>
              {filteredWorkers.length} trabajadora{filteredWorkers.length !== 1 ? 's' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(false)}
            className="lg:hidden mt-2 py-3.5 rounded-xl bg-[#0f2744] text-white text-base font-bold"
          >
            Ver {filteredWorkers.length} trabajadora{filteredWorkers.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>

      {/* Date selector strip */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 shrink-0">
        {filterSucursal.length === 0 ? (
          <div className="flex items-center gap-2 py-1 px-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-medium">
            <AlertCircle size={14} className="text-amber-500 shrink-0" />
            Selecciona una sucursal para ver y marcar la asistencia del día.
          </div>
        ) : dates.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">
            Selecciona un rango de fechas válido para ver los días.
          </p>
        ) : (
          <div ref={dateStripRef} className="flex gap-1.5 overflow-x-auto pb-1">
            {dates.map((dt) => {
              const { day, dow, monthShort } = formatDateLabel(dt);
              const isSelected = selectedDate === dt;
              const isSaving = savingDate === dt;
              const recordedCount = filteredWorkers.filter((w) => attendance[w.id]?.[dt]).length;
              const hasData = recordedCount > 0;
              const isToday = dt === new Date().toISOString().split('T')[0];
              const isLocked = lockedDates.has(dt);

              return (
                <button
                  key={dt}
                  data-date={dt}
                  onClick={() => setSelectedDate(isSelected ? '' : dt)}
                  className={`flex flex-col items-center px-2.5 py-2 rounded-xl min-w-[52px] lg:min-w-[48px] transition-all border text-center shrink-0 ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : isLocked
                        ? 'bg-red-50 border-red-200 text-red-700'
                        : isToday
                          ? 'bg-blue-50 border-blue-200 text-blue-700'
                          : hasData
                            ? 'bg-green-50 border-green-200 text-green-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-xs lg:text-[10px] font-medium opacity-70">{dow}</span>
                  <span className="text-base lg:text-sm font-bold">{day}</span>
                  <span className="text-[11px] lg:text-[9px] opacity-60">{monthShort}</span>
                  {isLocked ? (
                    <Lock
                      size={8}
                      className={`mt-0.5 ${isSelected ? 'text-white/80' : 'text-red-400'}`}
                    />
                  ) : isSaving ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-0.5" />
                  ) : pendingByDate[dt] ? (
                    <div
                      className="w-2 h-2 rounded-full mt-0.5 bg-amber-500 ring-2 ring-amber-200"
                      title="Tiene asistencia u horas extra por aprobar"
                    />
                  ) : hasData ? (
                    <div
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${isSelected ? 'bg-white/60' : 'bg-green-500'}`}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 p-4 lg:p-6">
        {/* Administradora: días con asistencia por aprobar */}
        {(canApprove || canApproveOvertime) && Object.keys(pendingByDate).length > 0 && (
          <div className="mb-4 flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-300 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-amber-900 mr-1">Por aprobar:</span>
            {Object.keys(pendingByDate)
              .sort()
              .map((dt) => {
                const { day, dow, monthShort } = formatDateLabel(dt);
                return (
                  <button
                    key={`pend-${dt}`}
                    type="button"
                    onClick={() => setSelectedDate(dt)}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-full border ${
                      selectedDate === dt
                        ? 'bg-amber-600 border-amber-600 text-white'
                        : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {dow} {day} {monthShort} ({pendingByDate[dt].count})
                  </button>
                );
              })}
          </div>
        )}
        {filterSucursal.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
              <AlertCircle size={28} className="text-amber-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-700">Selecciona una sucursal</p>
              <p className="text-sm text-gray-400 mt-1">
                Debes elegir una sucursal en el filtro de arriba para poder marcar la asistencia.
              </p>
            </div>
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-40">
            <RefreshCw size={20} className="animate-spin text-blue-500" />
            <span className="ml-2 text-sm text-gray-500">Cargando...</span>
          </div>
        ) : isPanelLocked ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
              <Lock size={28} className="text-red-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-700">Panel bloqueado</p>
              <p className="text-sm text-gray-400 mt-1">
                El panel de asistencia está bloqueado. Un administrador puede desbloquearlo con el
                botón «Bloqueada».
              </p>
            </div>
          </div>
        ) : selectedDate ? (
          <DayView
            date={selectedDate}
            dateLabel={(() => {
              const { day, dow, monthShort } = formatDateLabel(selectedDate);
              return `${dow} ${day} ${monthShort}`;
            })()}
            workers={filteredWorkers}
            attendance={attendance}
            overtime={overtime}
            getEffectiveStatus={getEffectiveStatus}
            getAutoStatus={getAutoStatus}
            isMallaNT={isMallaNT}
            onChangeStatus={changeStatus}
            onOpenOvertime={(w) => {
              if (lockedDates.has(selectedDate) || !canOvertime) return;
              const { day, dow, monthShort } = formatDateLabel(selectedDate);
              setOvertimeModal({
                workerId: w.id,
                workerName: w.name,
                date: selectedDate,
                dateLabel: `${dow} ${day} ${monthShort}`,
                currentHours: overtime[w.id]?.[selectedDate]?.hours ?? 0,
              });
            }}
            onOpenRetiro={(w) => {
              if (lockedDates.has(selectedDate)) return;
              const { day, dow, monthShort } = formatDateLabel(selectedDate);
              const rec = attendance[w.id]?.[selectedDate];
              setRetiroModal({
                workerId: w.id,
                workerName: w.name,
                date: selectedDate,
                dateLabel: `${dow} ${day} ${monthShort}`,
                currentHours: rec?.retiroHoras ?? 0,
                currentReason: rec?.retiroMotivo ?? '',
              });
            }}
            onOpenDailyAlert={() => openDailyAlert(selectedDate)}
            onMarkAllPresent={() => markAllPresent(selectedDate)}
            markingAll={markingAll || !periodReady}
            scheduledCount={selectedDateWorkers.length}
            recordedCount={dateRecorded}
            isLocked={lockedDates.has(selectedDate)}
            onToggleLock={() => openLockModal(selectedDate)}
            savingCells={savingCells}
            canMark={canMarkAttendance}
            canEditOvertime={canOvertime}
            canLock={canApprove}
            isAsistencia={isAsistencia}
            pendingCount={pendingByDate[selectedDate]?.count ?? 0}
            pendingBy={pendingByDate[selectedDate]?.by ?? []}
            onApprove={
              canApprove || canApproveOvertime ? () => approveDay(selectedDate) : undefined
            }
            approving={approving === selectedDate}
            getShiftText={(wid: string) => {
              const code = getShiftForDate(wid, selectedDate);
              const sh = code ? shifts[code] : undefined;
              if (sh?.start && sh?.end) return `${sh.start} a ${sh.end}`;
              // Con licencia, permiso o vacaciones: el turno que tenía programado
              const special = getSpecialForDate(wid, selectedDate);
              if (special) {
                const lic = getLicenciaTurno(wid, selectedDate);
                const ls = lic ? shifts[lic] : undefined;
                if (ls?.start && ls?.end)
                  return `${getStatusLabel(special)} (tenía ${ls.start} a ${ls.end})`;
              }
              return '';
            }}
          />
        ) : (
          <PeriodOverview
            dates={dates}
            workers={filteredWorkers}
            attendance={attendance}
            overtime={overtime}
            getEffectiveStatus={getEffectiveStatus}
            onSelectDate={setSelectedDate}
            onOpenDailyAlert={openDailyAlert}
            lockedDates={lockedDates}
            onToggleLock={openLockModal}
          />
        )}
      </div>

      {/* Modals */}
      {/* Save error toast */}
      {saveError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-red-600 text-white text-sm font-medium rounded-xl shadow-lg">
          <AlertCircle size={16} className="shrink-0" />
          {saveError}
          <button
            onClick={() => setSaveError(null)}
            className="ml-2 text-white/70 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
      {saveNotice && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 bg-green-600 text-white text-sm font-medium rounded-xl shadow-lg">
          <CheckCheck size={16} className="shrink-0" />
          {saveNotice}
        </div>
      )}
      {dailyAlert && (
        <DailyAlertModal
          date={dailyAlert.date}
          dateLabel={dailyAlert.dateLabel}
          workers={dailyAlert.workers}
          onConfirm={handleDailyAlertConfirm}
          onClose={() => setDailyAlert(null)}
        />
      )}
      {retiroModal && (
        <RetiroModal
          workerName={retiroModal.workerName}
          dateLabel={retiroModal.dateLabel}
          currentHours={retiroModal.currentHours}
          currentReason={retiroModal.currentReason}
          onSave={(hours, reason) =>
            saveRetiro(retiroModal.workerId, retiroModal.date, hours, reason)
          }
          onClose={() => setRetiroModal(null)}
        />
      )}
      {overtimeModal && (
        <OvertimeModal
          workerName={overtimeModal.workerName}
          dateLabel={overtimeModal.dateLabel}
          currentHours={overtimeModal.currentHours}
          currentNotes={overtime[overtimeModal.workerId]?.[overtimeModal.date]?.notes ?? ''}
          pendingBy={
            overtime[overtimeModal.workerId]?.[overtimeModal.date]?.pending
              ? (overtime[overtimeModal.workerId]?.[overtimeModal.date]?.proposedBy ?? '')
              : null
          }
          canApprove={canApproveOvertime}
          onSave={(hours, notes) =>
            saveOvertime(overtimeModal.workerId, overtimeModal.date, hours, notes)
          }
          onClose={() => setOvertimeModal(null)}
        />
      )}
      {lockModal && (
        <LockModal
          mode={lockModal.mode}
          dateLabel={lockModal.dateLabel}
          onConfirm={handleLockConfirm}
          onClose={() => {
            setLockModal(null);
            setLockError('');
          }}
          error={lockError}
        />
      )}
    </div>
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

interface Worker {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  cargo: string;
  role: string;
  sucursal: string;
  area: string;
}

interface DayViewProps {
  date: string;
  dateLabel: string;
  workers: Worker[];
  attendance: Record<string, Record<string, AttendanceRecord>>;
  overtime: Record<string, Record<string, OvertimeRecord>>;
  getEffectiveStatus: (wid: string, dt: string) => string;
  getAutoStatus: (wid: string, dt: string) => string | null;
  isMallaNT: (wid: string, dt: string) => boolean;
  onChangeStatus: (wid: string, dt: string, status: string) => void;
  onOpenOvertime: (w: Worker) => void;
  onOpenRetiro: (w: Worker) => void;
  onOpenDailyAlert: () => void;
  onMarkAllPresent: () => void;
  markingAll: boolean;
  scheduledCount: number;
  recordedCount: number;
  isLocked: boolean;
  onToggleLock: () => void;
  savingCells: Set<string>;
  /** Puede marcar asistencia (admin o rol asistencia) */
  canMark: boolean;
  /** Puede anotar horas extra (solo admin) */
  canEditOvertime: boolean;
  /** Puede bloquear y desbloquear el día (solo admin) */
  canLock: boolean;
  /** Nivel asistencia (jefa de caja): lo que marca queda por aprobar */
  isAsistencia: boolean;
  /** Trabajadoras con algo por aprobar este día, y quién lo marcó */
  pendingCount: number;
  pendingBy: string[];
  /** Solo admin: aprueba lo marcado y bloquea el día */
  onApprove?: () => void;
  approving: boolean;
  /** Horario del turno de la trabajadora ese día ("08:00 a 15:00") */
  getShiftText: (workerId: string) => string;
}

function DayView({
  date,
  dateLabel,
  workers,
  attendance,
  overtime,
  getEffectiveStatus,
  getAutoStatus,
  isMallaNT,
  onChangeStatus,
  onOpenOvertime,
  onOpenRetiro,
  onOpenDailyAlert,
  onMarkAllPresent,
  markingAll,
  isLocked,
  onToggleLock,
  savingCells,
  canMark,
  canEditOvertime,
  canLock,
  isAsistencia,
  pendingCount,
  pendingBy,
  onApprove,
  approving,
  getShiftText,
}: DayViewProps) {
  const editable = !isLocked && canMark;
  const presentCount = workers.filter((w) => getEffectiveStatus(w.id, date) === 'PRESENTE').length;
  const absentCount = workers.filter((w) => getEffectiveStatus(w.id, date) === 'AUSENTE').length;
  const totalHE = workers.reduce((sum, w) => sum + (overtime[w.id]?.[date]?.hours ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Lock banner */}
      {isLocked && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">
          <Lock size={14} />
          <span>Este día está bloqueado. No se pueden modificar los registros.</span>
          {canLock && (
            <button
              onClick={onToggleLock}
              className="ml-auto flex items-center gap-1 text-xs underline hover:no-underline"
            >
              <Unlock size={12} /> Desbloquear
            </button>
          )}
        </div>
      )}

      {/* Jefa de caja: lo que marca queda por aprobar */}
      {isAsistencia && !isLocked && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-3 text-sm">
          <Clock size={14} className="mt-0.5 shrink-0" />
          <span>
            Lo que marques queda <strong>por aprobar</strong> hasta que una administradora lo revise
            y lo apruebe.
            {pendingCount > 0 && ` Llevas ${pendingCount} marcada(s) en este día.`}
          </span>
        </div>
      )}

      {/* Administradora: aprobar lo que marcó la jefa de caja */}
      {onApprove && pendingCount > 0 && !isLocked && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl px-4 py-3">
          <div className="flex-1 text-sm">
            <p className="font-semibold">
              Por aprobar: {pendingCount} trabajadora(s)
              {pendingBy.length > 0 && ` · marcado por ${pendingBy.join(', ')}`}
            </p>
            <p className="text-xs mt-0.5">
              Revisa la asistencia y las horas extra, y corrige lo que no esté bien. Al aprobar,
              queda como oficial y el día se bloquea.
            </p>
          </div>
          <button
            type="button"
            onClick={onApprove}
            disabled={approving}
            className="flex items-center justify-center gap-2 px-4 py-3 lg:py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm lg:text-xs font-semibold shrink-0"
          >
            <CheckCheck size={14} />
            {approving ? 'Aprobando…' : 'Aprobar y bloquear día'}
          </button>
        </div>
      )}

      {/* Stats + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="grid grid-cols-3 gap-2 w-full lg:w-auto lg:flex lg:gap-3">
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-lg font-bold text-green-600">{presentCount}</div>
            <div className="text-xs lg:text-[10px] text-gray-500">Presentes</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-lg font-bold text-red-500">{absentCount}</div>
            <div className="text-xs lg:text-[10px] text-gray-500">Faltas injust.</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 text-center min-w-[80px]">
            <div className="text-lg font-bold text-amber-500">{totalHE}</div>
            <div className="text-xs lg:text-[10px] text-gray-500">HE Total</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full lg:w-auto lg:flex lg:items-center lg:flex-wrap">
          {editable && (
            <>
              <button
                onClick={onMarkAllPresent}
                disabled={markingAll}
                className="col-span-2 flex items-center justify-center gap-2 px-4 py-3.5 lg:py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-base lg:text-xs font-semibold transition-colors"
              >
                <CheckCheck size={14} />
                {markingAll ? 'Guardando...' : 'Todas asistieron'}
              </button>
              {!isAsistencia && (
                <button
                  onClick={onOpenDailyAlert}
                  className="flex items-center justify-center gap-2 px-4 py-3 lg:py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm lg:text-xs font-semibold transition-colors"
                >
                  <AlertCircle size={14} />
                  Control del día
                </button>
              )}
            </>
          )}
          {/* Lock / Unlock button */}
          {canLock && (
            <button
              onClick={onToggleLock}
              className={`flex items-center justify-center gap-2 px-4 py-3 lg:py-2.5 rounded-xl text-sm lg:text-xs font-semibold transition-colors ${
                isLocked ? 'col-span-2' : ''
              } ${
                isLocked
                  ? 'bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200'
                  : 'bg-red-500 hover:bg-red-600 text-white'
              }`}
            >
              {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
              {isLocked ? 'Desbloquear' : 'Guardar y bloquear'}
            </button>
          )}
        </div>
      </div>

      {/* Worker list */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800 text-sm">{dateLabel}</h3>
          <span className="text-xs text-gray-400">{workers.length} trabajadoras</span>
        </div>
        <div className="divide-y divide-gray-100">
          {workers.map((w) => {
            const status = getEffectiveStatus(w.id, date);
            const autoStatus = getAutoStatus(w.id, date);
            const isNT = isMallaNT(w.id, date);
            const isAuto = !attendance[w.id]?.[date] && autoStatus !== null;
            const he = overtime[w.id]?.[date]?.hours ?? 0;
            const hePending = he > 0 && !!overtime[w.id]?.[date]?.pending;

            return (
              <div
                key={w.id}
                className="flex flex-wrap lg:flex-nowrap items-center gap-3 px-4 lg:px-5 py-4 lg:py-3"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${w.avatarColor || 'bg-blue-100 text-blue-700'}`}
                >
                  {w.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base lg:text-sm font-semibold lg:font-medium text-gray-800 truncate">
                    {w.name}
                  </p>
                  <p className="text-sm lg:text-xs text-gray-500 lg:text-gray-400">
                    {w.cargo || w.role}
                    {getShiftText(w.id) ? ` · ${getShiftText(w.id)}` : ` · ${w.area}`}
                  </p>
                  {attendance[w.id]?.[date]?.pending && (
                    <span className="inline-block mt-1 text-[11px] lg:text-[10px] font-semibold text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                      Por aprobar
                    </span>
                  )}
                </div>
                {/* Celular: botones grandes para los dos estados más usados */}
                {editable && !isNT && !savingCells.has(`${w.id}_${date}`) && (
                  <div className="lg:hidden w-full grid grid-cols-2 gap-2">
                    {(['PRESENTE', 'AUSENTE'] as const).map((code) => {
                      const active = status === code;
                      const activeClass =
                        code === 'PRESENTE'
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'bg-red-600 border-red-600 text-white';
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => onChangeStatus(w.id, date, code)}
                          aria-pressed={active}
                          className={`min-h-[44px] rounded-xl border text-sm font-semibold ${
                            active ? activeClass : 'bg-white border-gray-300 text-gray-700'
                          }`}
                        >
                          {code === 'PRESENTE' ? 'Presente' : 'Falta'}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Status selector — disabled when locked or NT from Malla */}
                <div
                  className="relative w-full lg:w-auto lg:shrink-0"
                  title={isNT ? 'No trabajaba según la Malla' : undefined}
                >
                  {savingCells.has(`${w.id}_${date}`) ? (
                    <div
                      className={`flex items-center gap-1.5 text-sm lg:text-xs font-medium px-2.5 py-3 lg:py-1.5 rounded-lg border ${getStatusStyle(status)}`}
                    >
                      <RefreshCw size={10} className="animate-spin opacity-60" />
                      <span className="opacity-70">Guardando…</span>
                    </div>
                  ) : (
                    <>
                      <select
                        value={status}
                        onChange={(e) => onChangeStatus(w.id, date, e.target.value)}
                        disabled={!editable || isNT}
                        aria-label={`Estado de ${w.name}`}
                        className={`w-full lg:w-auto appearance-none text-base lg:text-xs font-medium px-3 lg:px-2.5 py-2.5 lg:py-1.5 rounded-xl lg:rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-300 pr-6 ${getStatusStyle(status)} ${!editable || isNT ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        {SELECTABLE_STATUSES.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.label}
                          </option>
                        ))}
                        {/* Estado antiguo ya guardado: se muestra para no perderlo */}
                        {!SELECTABLE_STATUSES.some((s) => s.code === status) && (
                          <option value={status}>{getStatusLabel(status)}</option>
                        )}
                      </select>
                      {editable && !isNT && (
                        <ChevronDown
                          size={10}
                          className="absolute right-3 lg:right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"
                        />
                      )}
                    </>
                  )}
                </div>
                {isNT && (
                  <span className="text-xs lg:text-[9px] text-gray-400 shrink-0">malla</span>
                )}
                {!isNT && isAuto && (
                  <span className="text-xs lg:text-[9px] text-gray-400 shrink-0">auto</span>
                )}
                {/* HE button (las horas extra las anota solo un admin) */}
                {(canEditOvertime || he > 0) && (
                  <button
                    onClick={() => onOpenOvertime(w)}
                    disabled={isLocked || !canEditOvertime}
                    title={
                      hePending
                        ? `Horas extra por aprobar${overtime[w.id]?.[date]?.proposedBy ? ` · anotó ${overtime[w.id]?.[date]?.proposedBy}` : ''}`
                        : canEditOvertime
                          ? undefined
                          : 'Las horas extra las anota un administrador'
                    }
                    className={`flex flex-1 lg:flex-none justify-center items-center gap-1 px-2 py-3 lg:py-1.5 rounded-xl lg:rounded-lg text-sm lg:text-xs font-medium transition-colors shrink-0 ${
                      hePending
                        ? `bg-white text-amber-700 border-2 border-dashed border-amber-400 ${canEditOvertime ? '' : 'cursor-default'}`
                        : he > 0
                          ? `bg-amber-100 text-amber-700 border border-amber-300 ${canEditOvertime ? '' : 'cursor-default'}`
                          : isLocked
                            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-amber-50 hover:text-amber-600'
                    }`}
                  >
                    <Clock size={11} />
                    {he > 0 ? `${he}h${hePending ? ' · por aprobar' : ''}` : 'HE'}
                  </button>
                )}
                {/* Retiro anticipado */}
                {(() => {
                  const retiro = attendance[w.id]?.[date]?.retiroHoras ?? 0;
                  return (
                    <button
                      onClick={() => onOpenRetiro(w)}
                      disabled={!editable}
                      title={
                        retiro > 0
                          ? `Se retiró antes: -${retiro}h${attendance[w.id]?.[date]?.retiroMotivo ? ` (${attendance[w.id]?.[date]?.retiroMotivo})` : ''}`
                          : 'Anotar si se retiró antes'
                      }
                      className={`flex flex-1 lg:flex-none justify-center items-center gap-1 px-2 py-3 lg:py-1.5 rounded-xl lg:rounded-lg text-sm lg:text-xs font-medium transition-colors shrink-0 ${
                        retiro > 0
                          ? 'bg-rose-100 text-rose-700 border border-rose-300'
                          : !editable
                            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                            : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-rose-50 hover:text-rose-600'
                      }`}
                    >
                      <LogOut size={11} />
                      {retiro > 0 ? `-${retiro}h` : 'Retiro'}
                    </button>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Period Overview ──────────────────────────────────────────────────────────

interface PeriodOverviewProps {
  dates: string[];
  workers: Worker[];
  attendance: Record<string, Record<string, AttendanceRecord>>;
  overtime: Record<string, Record<string, OvertimeRecord>>;
  getEffectiveStatus: (wid: string, dt: string) => string;
  onSelectDate: (dt: string) => void;
  onOpenDailyAlert: (dt: string) => void;
  lockedDates: Set<string>;
  onToggleLock: (dt: string) => void;
}

export function PeriodOverview({
  dates,
  workers,
  attendance,
  overtime,
  getEffectiveStatus,
  onSelectDate,
  lockedDates,
}: PeriodOverviewProps) {
  const visibleDates = dates;

  if (dates.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-gray-400">
        Selecciona un rango de fechas para ver el resumen del período.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-sm">Resumen del período</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Selecciona un día en la barra superior para ver el detalle o usar el control diario
          </p>
        </div>
        {/* Desplazamiento propio: al bajar quedan fijas las fechas y al moverse al lado, los nombres */}
        <div className="overflow-auto max-h-[calc(var(--app-height,100dvh)-130px)] min-h-[240px]">
          <table className="w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-600 sticky left-0 top-0 z-30 bg-gray-50 min-w-[160px] border-b border-r border-gray-200">
                  Trabajadora
                </th>
                {visibleDates.map((dt) => {
                  const { day, dow, monthShort } = formatDateLabel(dt);
                  const isLocked = lockedDates.has(dt);
                  return (
                    <th
                      key={dt}
                      className="px-1 py-2 font-medium text-gray-500 min-w-[36px] text-center sticky top-0 z-20 bg-gray-50 border-b border-gray-200"
                    >
                      <button
                        onClick={() => onSelectDate(dt)}
                        className={`flex flex-col items-center hover:text-blue-600 transition-colors ${isLocked ? 'text-red-400' : ''}`}
                        title={isLocked ? 'Día bloqueado' : undefined}
                      >
                        <span className="text-[9px]">{dow}</span>
                        <span className="font-bold">{day}</span>
                        <span className="text-[9px] opacity-60">{monthShort}</span>
                        {isLocked && <Lock size={8} className="text-red-400 mt-0.5" />}
                      </button>
                    </th>
                  );
                })}
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-center min-w-[60px] sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                  P
                </th>
                <th className="px-3 py-2.5 font-semibold text-gray-600 text-center min-w-[60px] sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                  F
                </th>
                <th className="px-3 py-2.5 font-semibold text-amber-600 text-center min-w-[60px] sticky top-0 z-20 bg-gray-50 border-b border-gray-200">
                  HE
                </th>
                <th
                  className="px-3 py-2.5 font-semibold text-rose-600 text-center min-w-[60px] sticky top-0 z-20 bg-gray-50 border-b border-gray-200"
                  title="Horas descontadas por retiro anticipado"
                >
                  Desc.
                </th>
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => {
                let totalP = 0,
                  totalA = 0,
                  totalHE = 0,
                  totalRetiro = 0;
                return (
                  <tr key={w.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2 sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-b border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${w.avatarColor || 'bg-blue-100 text-blue-700'}`}
                        >
                          {w.initials}
                        </div>
                        <span className="font-medium text-gray-800 truncate max-w-[110px]">
                          {w.name}
                        </span>
                      </div>
                    </td>
                    {visibleDates.map((dt) => {
                      const status = getEffectiveStatus(w.id, dt);
                      const he = overtime[w.id]?.[dt]?.hours ?? 0;
                      if (status === 'PRESENTE') totalP++;
                      if (status === 'AUSENTE') totalA++;
                      totalHE += he;
                      const retiro = attendance[w.id]?.[dt]?.retiroHoras ?? 0;
                      totalRetiro += retiro;
                      const statusColors: Record<string, string> = {
                        PRESENTE: 'bg-green-500',
                        AUSENTE: 'bg-red-500',
                        DESCANSO: 'bg-slate-300',
                        NT: 'bg-gray-200',
                        LICENCIA: 'bg-yellow-400',
                        PERMISO: 'bg-teal-400',
                        PERMISO_CG: 'bg-teal-400',
                        PERMISO_SG: 'bg-orange-400',
                        FALTA_JUSTIFICADA: 'bg-amber-400',
                        VACACIONES: 'bg-blue-400',
                        CUMPLEANOS: 'bg-pink-400',
                      };
                      const statusLetters: Record<string, string> = {
                        PRESENTE: 'P',
                        AUSENTE: 'F',
                        DESCANSO: 'D',
                        NT: '-',
                        LICENCIA: 'L',
                        PERMISO: 'M',
                        PERMISO_CG: 'M',
                        PERMISO_SG: 'S',
                        FALTA_JUSTIFICADA: 'J',
                        VACACIONES: 'V',
                        CUMPLEANOS: 'C',
                      };
                      const letterColors: Record<string, string> = {
                        PRESENTE: 'text-white',
                        AUSENTE: 'text-white',
                        DESCANSO: 'text-slate-600',
                        NT: 'text-gray-400',
                        LICENCIA: 'text-yellow-900',
                        PERMISO: 'text-white',
                        PERMISO_CG: 'text-white',
                        PERMISO_SG: 'text-white',
                        FALTA_JUSTIFICADA: 'text-white',
                        VACACIONES: 'text-white',
                        CUMPLEANOS: 'text-white',
                      };
                      return (
                        <td key={dt} className="px-1 py-2 text-center border-b border-gray-100">
                          <button
                            onClick={() => onSelectDate(dt)}
                            title={
                              retiro > 0
                                ? `${getStatusLabel(status)} · se retiró antes (-${retiro}h)`
                                : getStatusLabel(status)
                            }
                            className={`w-5 h-5 rounded-sm mx-auto flex items-center justify-center transition-transform hover:scale-110 ${statusColors[status] ?? 'bg-gray-200'}`}
                          >
                            <span
                              className={`text-[8px] font-bold leading-none ${letterColors[status] ?? 'text-gray-500'}`}
                            >
                              {statusLetters[status] ?? ''}
                            </span>
                          </button>
                          {he > 0 && (
                            <span
                              className="text-[9px] text-amber-600 font-bold block"
                              title={
                                overtime[w.id]?.[dt]?.pending
                                  ? 'Horas extra por aprobar'
                                  : undefined
                              }
                            >
                              {he}h{overtime[w.id]?.[dt]?.pending ? '*' : ''}
                            </span>
                          )}
                          {retiro > 0 && (
                            <span
                              className="text-[9px] text-rose-600 font-bold block"
                              title="Se retiró antes"
                            >
                              -{retiro}h
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center border-b border-gray-100 font-bold text-green-600">
                      {totalP}
                    </td>
                    <td className="px-3 py-2 text-center border-b border-gray-100 font-bold text-red-500">
                      {totalA}
                    </td>
                    <td className="px-3 py-2 text-center border-b border-gray-100 font-bold text-amber-500">
                      {totalHE > 0 ? totalHE : '-'}
                    </td>
                    <td className="px-3 py-2 text-center border-b border-gray-100 font-bold text-rose-600">
                      {totalRetiro > 0 ? `-${totalRetiro}` : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      {(() => {
        const legendLetters: Record<string, string> = {
          PRESENTE: 'P',
          AUSENTE: 'F',
          DESCANSO: 'D',
          NT: '-',
          LICENCIA: 'L',
          PERMISO: 'M',
          PERMISO_CG: 'M',
          PERMISO_SG: 'S',
          FALTA_JUSTIFICADA: 'J',
          VACACIONES: 'V',
          CUMPLEANOS: 'C',
        };
        const legendBg: Record<string, string> = {
          PRESENTE: 'bg-green-500',
          AUSENTE: 'bg-red-500',
          DESCANSO: 'bg-slate-300',
          NT: 'bg-gray-200',
          LICENCIA: 'bg-yellow-400',
          PERMISO: 'bg-teal-400',
          PERMISO_CG: 'bg-teal-400',
          PERMISO_SG: 'bg-orange-400',
          FALTA_JUSTIFICADA: 'bg-amber-400',
          VACACIONES: 'bg-blue-400',
          CUMPLEANOS: 'bg-pink-400',
        };
        const legendLetterColor: Record<string, string> = {
          PRESENTE: 'text-white',
          AUSENTE: 'text-white',
          DESCANSO: 'text-slate-600',
          NT: 'text-gray-400',
          LICENCIA: 'text-yellow-900',
          PERMISO: 'text-white',
          PERMISO_CG: 'text-white',
          PERMISO_SG: 'text-white',
          FALTA_JUSTIFICADA: 'text-white',
          VACACIONES: 'text-white',
          CUMPLEANOS: 'text-white',
        };
        return (
          <div className="flex flex-wrap gap-2">
            {SELECTABLE_STATUSES.map((s) => (
              <div
                key={s.code}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${s.color}`}
              >
                <div
                  className={`w-4 h-4 rounded-sm flex items-center justify-center shrink-0 ${legendBg[s.code] ?? 'bg-gray-200'}`}
                >
                  <span
                    className={`text-[8px] font-bold leading-none ${legendLetterColor[s.code] ?? 'text-gray-500'}`}
                  >
                    {legendLetters[s.code] ?? ''}
                  </span>
                </div>
                {s.label}
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

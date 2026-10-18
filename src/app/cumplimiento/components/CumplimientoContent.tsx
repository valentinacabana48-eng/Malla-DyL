'use client';
import React, { useState, useMemo } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Search, Info } from 'lucide-react';
import {
  useAppContext,
  getDaysOfWeekForMonth,
  getDaysInMonth,
  monthLabelToKey,
  calcNetHours,
  MESES,
} from '@/context/AppContext';

interface ComplianceRule {
  id: string;
  label: string;
  description: string;
}

const RULES: ComplianceRule[] = [
  { id: 'consecutive', label: 'Días consec.', description: 'Máx. 7 días seguidos sin descanso' },
  { id: 'sundays_off', label: 'Domingos', description: 'Mínimo 2 domingos libres al mes' },
  { id: 'weekly_hours', label: 'Hrs/semana', description: 'Horas programadas ≥ horas contratadas/semana' },
];

interface WorkerCompliance {
  workerId: string;
  workerName: string;
  initials: string;
  avatarColor: string;
  area: string;
  cargo: string;
  horasContratadas: number;
  expectedMonthlyHours: number;
  rules: Record<string, { pass: boolean; detail: string }>;
  overallPass: boolean;
  totalMonthHours: number;
}

const MONTH_NAMES_MAP: Record<string, number> = {
  'Enero': 0, 'Febrero': 1, 'Marzo': 2, 'Abril': 3, 'Mayo': 4, 'Junio': 5,
  'Julio': 6, 'Agosto': 7, 'Septiembre': 8, 'Octubre': 9, 'Noviembre': 10, 'Diciembre': 11,
};

export default function CumplimientoContent() {
  const {
    workers, shifts, scheduleData, specialDays,
    selectedMes, setSelectedMes,
    sucursales, areas,
  } = useAppContext();

  const [selectedSucursal, setSelectedSucursal] = useState('Todas');
  const [selectedArea, setSelectedArea] = useState('Todas');
  const [nameSearch, setNameSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('all');
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [showHoursInfo, setShowHoursInfo] = useState(false);

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

  const complianceData = useMemo<WorkerCompliance[]>(() => {
    const activeWorkers = workers.filter(w => {
      if (w.estado !== 'Activo') return false;
      if (selectedSucursal !== 'Todas' && w.sucursal !== selectedSucursal) return false;
      if (selectedArea !== 'Todas' && w.area !== selectedArea) return false;
      if (nameSearch.trim()) {
        const q = nameSearch.trim().toLowerCase();
        if (!w.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return activeWorkers.map(worker => {
      const sched = currentMonthSchedule[worker.id] || [];
      const workerSpecialDays = currentMonthSpecialDays[worker.id] || {};

      // horasContratadas = horas SEMANALES contratadas (10, 20, 30 o 42 h/semana)
      const horasSemanales = worker.horasContratadas ?? 42;
      // Horas mensuales esperadas = horas semanales × 4.33 semanas promedio
      const expectedMonthlyHours = Math.round(horasSemanales * 4.33);

      const assignedCount = sched.filter((s, i) => s && s !== 'DESC' && !workerSpecialDays[i]).length;
      const hasAnyShifts = assignedCount > 0;

      // ── Regla 1: Días consecutivos ──
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
      const consecutivePass = !hasAnyShifts || maxConsec < 7;
      const consecutiveDetail = hasAnyShifts
        ? consecutivePass
          ? `Máx. ${maxConsec} días consecutivos ✓`
          : `${maxConsec} días consecutivos (máx. permitido: 6)`
        : 'Sin turnos asignados';

      // ── Regla 2: Domingos libres ──
      const totalSundays = daysOfWeek.slice(0, daysInMonth).filter(d => d === 'D').length;
      let sundaysOff = 0;
      for (let i = 0; i < daysInMonth; i++) {
        if (daysOfWeek[i] === 'D') {
          const isSpecial = !!workerSpecialDays[i];
          if (isSpecial || !sched[i] || sched[i] === 'DESC') sundaysOff++;
        }
      }
      const minSundaysOff = Math.min(2, totalSundays);
      // Workers with 10h or 20h/week contracts work every Sunday by nature of their schedule — skip the Sunday rest rule
      const worksEverySunday = horasSemanales === 10 || horasSemanales === 20;
      const sundaysPass = worksEverySunday || !hasAnyShifts || totalSundays < 2 || sundaysOff >= minSundaysOff;
      const sundaysDetail = worksEverySunday
        ? 'Trabaja todos los domingos (contrato 10h/20h) ✓'
        : hasAnyShifts
          ? sundaysPass
            ? `${sundaysOff} de ${totalSundays} domingo(s) libre(s) ✓`
            : `Solo ${sundaysOff} de ${totalSundays} domingo(s) libre(s) (mín. ${minSundaysOff})`
          : 'Sin turnos asignados';

      // ── Regla 3: Horas semanales ──
      // horasSemanales = horas contratadas por semana
      const parts = (selectedMes || '').split(' ');
      const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 7;
      const year = parseInt(parts[1] || '2026', 10);

      const weekData: Record<number, { hours: number; daysInMonth: number; scheduledDays: number; totalWeekDays: number }> = {};
      let totalMonthHours = 0;

      for (let i = 0; i < daysInMonth; i++) {
        const date = new Date(year, monthIdx, i + 1);
        const dayOfWeek = (date.getDay() + 6) % 7; // Monday=0
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - dayOfWeek);
        const weekKey = weekStart.getTime();
        if (!weekData[weekKey]) weekData[weekKey] = { hours: 0, daysInMonth: 0, scheduledDays: 0, totalWeekDays: 7 };
        weekData[weekKey].daysInMonth++;

        const isSpecial = !!workerSpecialDays[i];
        if (isSpecial || !sched[i] || sched[i] === 'DESC') continue;
        const shiftInfo = shifts[sched[i] as string];
        if (!shiftInfo) continue;
        const hrs = calcNetHours(shiftInfo);
        weekData[weekKey].hours += hrs;
        weekData[weekKey].scheduledDays++;
        totalMonthHours += hrs;
      }

      // For partial weeks, required hours are proportional to actual scheduled days in that week
      const tolerance = 0.1; // 10% tolerance
      const underWeeks = Object.values(weekData).filter(d => {
        if (d.hours === 0 || d.scheduledDays === 0) return false; // weeks with 0h are not penalized
        // proportional required hours based on actual days scheduled (not calendar days)
        const requiredHours = horasSemanales * (d.scheduledDays / 7);
        return d.hours < requiredHours * (1 - tolerance);
      });
      const weeklyPass = !hasAnyShifts || underWeeks.length === 0;
      const weeklyDetail = hasAnyShifts
        ? weeklyPass
          ? `Todas las semanas ≥ horas proporcionales ✓`
          : `${underWeeks.length} semana(s) con horas insuficientes`
        : 'Sin turnos asignados';

      // ── Regla 4: Horas mensuales ──
      // Tolerancia del 10% sobre las horas mensuales esperadas
      const monthlyTolerance = expectedMonthlyHours * 0.1;
      const monthlyPass = !hasAnyShifts || Math.abs(totalMonthHours - expectedMonthlyHours) <= monthlyTolerance;
      const monthlyDetail = hasAnyShifts
        ? monthlyPass
          ? `${totalMonthHours.toFixed(1)}h / ~${expectedMonthlyHours}h esperadas ✓`
          : `${totalMonthHours.toFixed(1)}h programadas (esperado ~${expectedMonthlyHours}h ±10%)`
        : `0h programadas (esperado ~${expectedMonthlyHours}h)`;

      const overallPass = consecutivePass && sundaysPass && weeklyPass;

      return {
        workerId: worker.id,
        workerName: worker.name,
        initials: worker.initials,
        avatarColor: worker.avatarColor || '#1d5bd4',
        area: worker.area,
        cargo: worker.cargo || worker.role,
        horasContratadas: horasSemanales,
        expectedMonthlyHours,
        totalMonthHours,
        rules: {
          consecutive: { pass: consecutivePass, detail: consecutiveDetail },
          sundays_off: { pass: sundaysPass, detail: sundaysDetail },
          weekly_hours: { pass: weeklyPass, detail: weeklyDetail },
        },
        overallPass,
      };
    });
  }, [workers, currentMonthSchedule, currentMonthSpecialDays, daysOfWeek, daysInMonth, shifts, selectedMes, selectedSucursal, selectedArea, nameSearch]);

  const filteredCompliance = useMemo(() => {
    if (filterStatus === 'pass') return complianceData.filter(w => w.overallPass);
    if (filterStatus === 'fail') return complianceData.filter(w => !w.overallPass);
    return complianceData;
  }, [complianceData, filterStatus]);

  const passCount = complianceData.filter(w => w.overallPass).length;
  const failCount = complianceData.filter(w => !w.overallPass).length;
  const passRate = complianceData.length > 0 ? Math.round((passCount / complianceData.length) * 100) : 0;

  return (
    <div className="p-6 xl:p-8 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <ShieldCheck size={20} className="text-secondary" />
            Verificación de Cumplimiento
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">Estado de cumplimiento laboral por trabajadora</p>
        </div>
        <select
          value={selectedMes}
          onChange={e => setSelectedMes(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          {MESES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* Hours explanation banner */}
      <div className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <button
          onClick={() => setShowHoursInfo(v => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Info size={15} className="text-blue-600 shrink-0" />
            <span className="text-sm font-semibold text-blue-800">¿Cómo se calculan las horas?</span>
          </div>
          <span className="text-blue-500 text-xs font-medium">{showHoursInfo ? 'Ocultar ▲' : 'Ver detalle ▼'}</span>
        </button>
        {showHoursInfo && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-blue-900">
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">📋 Horas contratadas (semanales)</p>
              <p>Cada trabajadora tiene un contrato de <strong>10, 20, 30 o 42 horas por semana</strong>. Este valor se configura en la sección Personal.</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">📅 Horas mensuales esperadas</p>
              <p>Se calculan como: <strong>horas/semana × 4.33</strong> (promedio de semanas en un mes). Ej: 42h/sem → ~182h/mes.</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">⏱️ Horas programadas</p>
              <p>Son las horas reales de cada turno asignado en la malla, descontando el tiempo de colación si el turno supera 6 horas.</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">✅ Criterio de cumplimiento</p>
              <p>Se acepta una <strong>tolerancia del ±10%</strong> sobre las horas esperadas. Semanas con 0h no se penalizan si no hay turnos asignados.</p>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-card border border-border rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <p className="text-xs text-muted-foreground mb-1">Total trabajadoras</p>
          <p className="text-2xl font-bold text-foreground">{complianceData.length}</p>
        </div>
        <div className="bg-card border border-green-200 rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={14} className="text-green-600" />
            <p className="text-xs text-green-700 font-medium">Cumplen</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{passCount}</p>
          <p className="text-xs text-green-600 mt-0.5">{passRate}% del total</p>
        </div>
        <div className="bg-card border border-red-200 rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className="text-red-500" />
            <p className="text-xs text-red-600 font-medium">No cumplen</p>
          </div>
          <p className="text-2xl font-bold text-red-600">{failCount}</p>
          <p className="text-xs text-red-500 mt-0.5">{100 - passRate}% del total</p>
        </div>
      </div>

      {/* Progress bar */}
      {complianceData.length > 0 && (
        <div className="mb-5 bg-card border border-border rounded-2xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tasa de cumplimiento</span>
            <span className="text-sm font-bold text-foreground">{passRate}%</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${passRate}%`,
                background: passRate >= 80 ? '#16a34a' : passRate >= 50 ? '#d97706' : '#dc2626',
              }}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar trabajadora..."
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
        <select
          value={selectedSucursal}
          onChange={e => setSelectedSucursal(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="Todas">Todas las sucursales</option>
          {sucursales.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
        <select
          value={selectedArea}
          onChange={e => setSelectedArea(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="Todas">Todas las áreas</option>
          {areas.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          {(['all', 'pass', 'fail'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === f ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'Todas' : f === 'pass' ? '✓ Cumplen' : '✗ No cumplen'}
            </button>
          ))}
        </div>
      </div>

      {/* Rules legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {RULES.map(r => (
          <div key={r.id} className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{r.label}</span>
            <span className="text-[10px] text-muted-foreground">— {r.description}</span>
          </div>
        ))}
      </div>

      {/* Worker compliance list */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
        {/* Table header */}
        <div className="grid grid-cols-[1fr_100px_100px_100px_90px] gap-0 border-b border-border bg-muted/30 px-4 py-2.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Trabajadora</span>
          {RULES.map(r => (
            <span key={r.id} className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center hidden md:block">
              {r.label}
            </span>
          ))}
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">Estado</span>
        </div>

        {filteredCompliance.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No hay trabajadoras que coincidan con los filtros
          </div>
        ) : (
          filteredCompliance.map(wc => {
            const isExpanded = expandedWorker === wc.workerId;
            return (
              <div key={wc.workerId} className="border-b border-border/50 last:border-0">
                <button
                  onClick={() => setExpandedWorker(isExpanded ? null : wc.workerId)}
                  className={`w-full grid grid-cols-[1fr_100px_100px_100px_90px] gap-0 px-4 py-3 text-left transition-colors hover:bg-muted/20 ${
                    wc.overallPass ? '' : 'bg-red-50/40'
                  }`}
                >
                  {/* Worker info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                      style={{ background: wc.avatarColor }}
                    >
                      {wc.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{wc.workerName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {wc.cargo} · {wc.area} · <span className="font-medium">{wc.horasContratadas}h/sem</span> (~{wc.expectedMonthlyHours}h/mes)
                      </p>
                    </div>
                  </div>

                  {/* Rule indicators */}
                  {RULES.map(r => {
                    const rule = wc.rules[r.id];
                    return (
                      <div key={r.id} className="flex items-center justify-center hidden md:flex" title={rule.detail}>
                        {rule.pass ? (
                          <CheckCircle2 size={16} className="text-green-500" />
                        ) : (
                          <XCircle size={16} className="text-red-500" />
                        )}
                      </div>
                    );
                  })}

                  {/* Overall status */}
                  <div className="flex items-center justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      wc.overallPass
                        ? 'bg-green-100 text-green-700' :'bg-red-100 text-red-700'
                    }`}>
                      {wc.overallPass ? (
                        <><CheckCircle2 size={10} /> OK</>
                      ) : (
                        <><XCircle size={10} /> Alerta</>
                      )}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-muted/10 border-t border-border/30">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                      {RULES.map(r => {
                        const rule = wc.rules[r.id];
                        return (
                          <div
                            key={r.id}
                            className={`rounded-xl p-3 border ${
                              rule.pass
                                ? 'bg-green-50 border-green-200' :'bg-red-50 border-red-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              {rule.pass ? (
                                <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                              ) : (
                                <XCircle size={12} className="text-red-500 shrink-0" />
                              )}
                              <span className={`text-[10px] font-bold uppercase tracking-wide ${rule.pass ? 'text-green-700' : 'text-red-600'}`}>
                                {r.label}
                              </span>
                            </div>
                            <p className={`text-xs ${rule.pass ? 'text-green-800' : 'text-red-700'}`}>
                              {rule.detail}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground bg-muted/20 rounded-xl px-3 py-2">
                      <span>Horas contratadas: <strong className="text-foreground">{wc.horasContratadas}h/semana</strong></span>
                      <span>Horas programadas este mes: <strong className="text-foreground">{wc.totalMonthHours.toFixed(1)}h</strong></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

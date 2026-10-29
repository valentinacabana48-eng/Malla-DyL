'use client';
import React, { useState, useMemo } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Search, Info } from 'lucide-react';
import { useAppContext, monthLabelToKey, MESES } from '@/context/AppContext';
import { evaluateMonth, MAX_CONSECUTIVE_DAYS, MIN_SUNDAYS_OFF } from '@/lib/compliance';

interface ComplianceRule {
  id: string;
  label: string;
  description: string;
}

const RULES: ComplianceRule[] = [
  {
    id: 'consecutive',
    label: 'Días consec.',
    description: `Máx. ${MAX_CONSECUTIVE_DAYS} días seguidos sin descanso`,
  },
  {
    id: 'sundays_off',
    label: 'Domingos',
    description: `Mínimo ${MIN_SUNDAYS_OFF} domingos libres al mes (salvo quien trabaja todos los domingos)`,
  },
  {
    id: 'weekly_hours',
    label: 'Hrs/semana',
    description: 'Horas de cada semana dentro de lo contratado (sin pasarse ni quedar corto)',
  },
];

interface WorkerCompliance {
  workerId: string;
  workerName: string;
  initials: string;
  area: string;
  cargo: string;
  horasContratadas: number;
  expectedMonthlyHours: number;
  rules: Record<string, { pass: boolean; detail: string }>;
  overallPass: boolean;
  totalMonthHours: number;
}

export default function CumplimientoContent() {
  const {
    workers,
    shifts,
    scheduleData,
    specialDays,
    selectedMes,
    setSelectedMes,
    sucursales,
    areas,
  } = useAppContext();

  const [selectedSucursal, setSelectedSucursal] = useState('Todas');
  const [selectedArea, setSelectedArea] = useState('Todas');
  const [nameSearch, setNameSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pass' | 'fail'>('all');
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [showHoursInfo, setShowHoursInfo] = useState(false);

  const currentMonthSchedule = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    return scheduleData[monthKey] || {};
  }, [scheduleData, selectedMes]);

  const currentMonthSpecialDays = useMemo(() => {
    const monthKey = monthLabelToKey(selectedMes);
    return specialDays[monthKey] || {};
  }, [specialDays, selectedMes]);

  const complianceData = useMemo<WorkerCompliance[]>(() => {
    const activeWorkers = workers.filter((w) => {
      if (w.estado !== 'Activo') return false;
      if (selectedSucursal !== 'Todas' && w.sucursal !== selectedSucursal) return false;
      if (selectedArea !== 'Todas' && w.area !== selectedArea) return false;
      if (nameSearch.trim()) {
        const q = nameSearch.trim().toLowerCase();
        if (!w.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    return activeWorkers.map((worker) => {
      const sched = currentMonthSchedule[worker.id] || [];
      const workerSpecialDays = currentMonthSpecialDays[worker.id] || {};

      // horasContratadas = horas SEMANALES contratadas (10, 20, 30 o 42 h/semana)
      const horasSemanales = worker.horasContratadas ?? 42;
      // Horas mensuales esperadas = horas semanales × 4.33 semanas promedio
      const expectedMonthlyHours = Math.round(horasSemanales * 4.33);

      // Mismas reglas que la Malla (src/lib/compliance.ts)
      const monthKey = monthLabelToKey(selectedMes);
      const [year, month] = monthKey.split('-').map(Number);
      const keyOf = (y: number, m: number) => {
        const date = new Date(y, m - 1, 1);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      };
      const prevKey = keyOf(year, month - 1);
      const nextKey = keyOf(year, month + 1);
      const c = evaluateMonth({
        year,
        monthIdx: month - 1,
        sched,
        special: workerSpecialDays,
        prevSched: scheduleData[prevKey]?.[worker.id],
        prevSpecial: specialDays[prevKey]?.[worker.id],
        nextSched: scheduleData[nextKey]?.[worker.id],
        nextSpecial: specialDays[nextKey]?.[worker.id],
        shifts,
        weeklyHours: horasSemanales,
        exentoDomingos: worker.exentoDomingos,
      });
      const hasAnyShifts = c.hasShifts;
      const totalMonthHours = c.totalHours;

      // ── Regla 1: Días seguidos ──
      const consecutivePass = c.consecutiveOk;
      const consecutiveDetail = hasAnyShifts
        ? consecutivePass
          ? `Máx. ${c.maxConsecutive} días seguidos ✓`
          : `${c.maxConsecutive} días seguidos (máx. permitido: ${MAX_CONSECUTIVE_DAYS})`
        : 'Sin turnos asignados';

      // ── Regla 2: Domingos libres ──
      const sundaysPass = c.sundaysOk;
      const sundaysDetail = worker.exentoDomingos
        ? 'Trabaja todos los domingos (no aplica) ✓'
        : !hasAnyShifts
          ? 'Sin turnos asignados'
          : !c.sundayRuleApplies
            ? `El mes tiene ${c.totalSundays} domingo(s): no aplica ✓`
            : sundaysPass
              ? `${c.sundaysOff} de ${c.totalSundays} domingo(s) libre(s) ✓`
              : `Solo ${c.sundaysOff} de ${c.totalSundays} domingo(s) libre(s) (mín. ${MIN_SUNDAYS_OFF})`;

      // ── Regla 3: Horas por semana ──
      const overWeeks = c.weeks.filter((w) => w.over);
      const underWeeks = c.weeks.filter((w) => w.under);
      const weeklyPass = !hasAnyShifts || (overWeeks.length === 0 && underWeeks.length === 0);
      const weeklyDetail = !hasAnyShifts
        ? 'Sin turnos asignados'
        : weeklyPass
          ? `Todas las semanas dentro de las ${horasSemanales}h contratadas ✓`
          : [
              overWeeks.length > 0
                ? `${overWeeks.length} semana(s) sobre ${horasSemanales}h (${overWeeks.map((w) => `${w.startDay}-${w.endDay}: ${w.totalHours}h`).join(', ')})`
                : '',
              underWeeks.length > 0 ? `${underWeeks.length} semana(s) con horas insuficientes` : '',
            ]
              .filter(Boolean)
              .join(' · ');

      const overallPass = consecutivePass && sundaysPass && weeklyPass;

      return {
        workerId: worker.id,
        workerName: worker.name,
        initials: worker.initials,
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
  }, [
    workers,
    currentMonthSchedule,
    currentMonthSpecialDays,
    scheduleData,
    specialDays,
    shifts,
    selectedMes,
    selectedSucursal,
    selectedArea,
    nameSearch,
  ]);

  const filteredCompliance = useMemo(() => {
    if (filterStatus === 'pass') return complianceData.filter((w) => w.overallPass);
    if (filterStatus === 'fail') return complianceData.filter((w) => !w.overallPass);
    return complianceData;
  }, [complianceData, filterStatus]);

  const passCount = complianceData.filter((w) => w.overallPass).length;
  const failCount = complianceData.filter((w) => !w.overallPass).length;
  const passRate =
    complianceData.length > 0 ? Math.round((passCount / complianceData.length) * 100) : 0;

  return (
    <div className="p-6 xl:p-8 max-w-screen-xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <ShieldCheck size={20} className="text-secondary" />
            Verificación de Cumplimiento
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">
            Estado de cumplimiento laboral por trabajadora
          </p>
        </div>
        <select
          value={selectedMes}
          onChange={(e) => setSelectedMes(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          {MESES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Hours explanation banner */}
      <div className="mb-5 bg-blue-50 border border-blue-200 rounded-2xl p-4">
        <button
          onClick={() => setShowHoursInfo((v) => !v)}
          className="w-full flex items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2">
            <Info size={15} className="text-blue-600 shrink-0" />
            <span className="text-sm font-semibold text-blue-800">
              ¿Cómo se calculan las horas?
            </span>
          </div>
          <span className="text-blue-500 text-xs font-medium">
            {showHoursInfo ? 'Ocultar ▲' : 'Ver detalle ▼'}
          </span>
        </button>
        {showHoursInfo && (
          <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs text-blue-900">
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">📋 Horas contratadas (semanales)</p>
              <p>
                Cada trabajadora tiene un contrato de{' '}
                <strong>10, 20, 30 o 42 horas por semana</strong>. Este valor se configura en la
                sección Personal.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">📅 Horas mensuales esperadas</p>
              <p>
                Se calculan como: <strong>horas/semana × 4.33</strong> (promedio de semanas en un
                mes). Ej: 42h/sem → ~182h/mes.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">⏱️ Horas programadas</p>
              <p>
                Son las horas reales de cada turno asignado en la malla, descontando el tiempo de
                colación si el turno supera 6 horas.
              </p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 border border-blue-100">
              <p className="font-bold mb-1">✅ Criterio de cumplimiento</p>
              <p>
                Se acepta una <strong>tolerancia del ±10%</strong> sobre las horas esperadas.
                Semanas con 0h no se penalizan si no hay turnos asignados.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div
          className="bg-card border border-border rounded-2xl p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <p className="text-xs text-muted-foreground mb-1">Total trabajadoras</p>
          <p className="text-2xl font-bold text-foreground">{complianceData.length}</p>
        </div>
        <div
          className="bg-card border border-green-200 rounded-2xl p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 size={14} className="text-green-600" />
            <p className="text-xs text-green-700 font-medium">Cumplen</p>
          </div>
          <p className="text-2xl font-bold text-green-700">{passCount}</p>
          <p className="text-xs text-green-600 mt-0.5">{passRate}% del total</p>
        </div>
        <div
          className="bg-card border border-red-200 rounded-2xl p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
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
        <div
          className="mb-5 bg-card border border-border rounded-2xl p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Tasa de cumplimiento
            </span>
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
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Buscar trabajadora..."
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
          />
        </div>
        <select
          value={selectedSucursal}
          onChange={(e) => setSelectedSucursal(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="Todas">Todas las sucursales</option>
          {sucursales.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={selectedArea}
          onChange={(e) => setSelectedArea(e.target.value)}
          className="px-3 py-2 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary"
        >
          <option value="Todas">Todas las áreas</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
          {(['all', 'pass', 'fail'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                filterStatus === f
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'Todas' : f === 'pass' ? '✓ Cumplen' : '✗ No cumplen'}
            </button>
          ))}
        </div>
      </div>

      {/* Rules legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {RULES.map((r) => (
          <div key={r.id} className="flex items-center gap-1.5 bg-muted/40 rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
              {r.label}
            </span>
            <span className="text-[10px] text-muted-foreground">— {r.description}</span>
          </div>
        ))}
      </div>

      {/* Worker compliance list */}
      <div
        className="bg-card border border-border rounded-2xl overflow-hidden"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto] lg:grid-cols-[1fr_100px_100px_100px_90px] gap-x-3 lg:gap-x-0 border-b border-border bg-muted/30 px-4 py-2.5">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Trabajadora
          </span>
          {RULES.map((r) => (
            <span
              key={r.id}
              className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center hidden lg:block"
            >
              {r.label}
            </span>
          ))}
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-center">
            Estado
          </span>
        </div>

        {filteredCompliance.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No hay trabajadoras que coincidan con los filtros
          </div>
        ) : (
          filteredCompliance.map((wc) => {
            const isExpanded = expandedWorker === wc.workerId;
            return (
              <div key={wc.workerId} className="border-b border-border/50 last:border-0">
                <button
                  onClick={() => setExpandedWorker(isExpanded ? null : wc.workerId)}
                  className={`w-full grid grid-cols-[1fr_auto] lg:grid-cols-[1fr_100px_100px_100px_90px] gap-x-3 lg:gap-x-0 px-4 py-3 text-left transition-colors hover:bg-muted/20 ${
                    wc.overallPass ? '' : 'bg-red-50/40'
                  }`}
                >
                  {/* Worker info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-[11px] font-bold shrink-0">
                      {wc.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {wc.workerName}
                      </p>
                      <p className="text-xs lg:text-[10px] text-muted-foreground">
                        {wc.cargo} · {wc.area} ·{' '}
                        <span className="font-medium">{wc.horasContratadas}h/sem</span> (~
                        {wc.expectedMonthlyHours}h/mes)
                      </p>
                    </div>
                  </div>

                  {/* Rule indicators */}
                  {RULES.map((r) => {
                    const rule = wc.rules[r.id];
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-center hidden lg:flex"
                        title={rule.detail}
                      >
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
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs lg:text-[10px] font-bold ${
                        wc.overallPass ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {wc.overallPass ? (
                        <>
                          <CheckCircle2 size={10} /> OK
                        </>
                      ) : (
                        <>
                          <XCircle size={10} /> Alerta
                        </>
                      )}
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 bg-muted/10 border-t border-border/30">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
                      {RULES.map((r) => {
                        const rule = wc.rules[r.id];
                        return (
                          <div
                            key={r.id}
                            className={`rounded-xl p-3 border ${
                              rule.pass
                                ? 'bg-green-50 border-green-200'
                                : 'bg-red-50 border-red-200'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              {rule.pass ? (
                                <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                              ) : (
                                <XCircle size={12} className="text-red-500 shrink-0" />
                              )}
                              <span
                                className={`text-xs lg:text-[10px] font-bold uppercase tracking-wide ${rule.pass ? 'text-green-700' : 'text-red-600'}`}
                              >
                                {r.label}
                              </span>
                            </div>
                            <p
                              className={`text-xs ${rule.pass ? 'text-green-800' : 'text-red-700'}`}
                            >
                              {rule.detail}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs lg:text-[11px] text-muted-foreground bg-muted/20 rounded-xl px-3 py-2">
                      <span>
                        Horas contratadas:{' '}
                        <strong className="text-foreground">{wc.horasContratadas}h/semana</strong>
                      </span>
                      <span>
                        Horas programadas este mes:{' '}
                        <strong className="text-foreground">
                          {wc.totalMonthHours.toFixed(1)}h
                        </strong>
                      </span>
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

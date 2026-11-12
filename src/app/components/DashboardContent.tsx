'use client';
import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Users,
  UserCheck,
  ChevronDown,
  Clock,
  Package,
  Cake,
  TrendingUp,
} from 'lucide-react';
import { useAppContext, monthLabelToKey } from '@/context/AppContext';
import MultiSelect from '@/components/ui/MultiSelect';
import { useCargoOptions } from '@/hooks/useCargoOptions';
import CoberturaLugares from './CoberturaLugares';

const MULTI_LABEL =
  'block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5';
const MULTI_BUTTON =
  'w-full py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground transition-colors hover:border-secondary/40';

const MONTH_NAMES = [
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
];
const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const HOUR_SLOTS: string[] = Array.from(
  { length: 24 },
  (_, i) => `${String(i).padStart(2, '0')}:00`
);

interface HourlySummary {
  hour: string;
  entering: number;
  exiting: number;
  active: number;
  vacantCajas: number;
}

function getDatesForMonth(year: number, month: number) {
  const days: { label: string; value: string }[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    days.push({
      label: `${DAY_NAMES[date.getDay()]} ${d} de ${MONTH_NAMES[month]} ${year}`,
      value: `${year}-${month + 1}-${d}`,
    });
  }
  return days;
}

export default function DashboardContent() {
  const {
    workers,
    shifts,
    scheduleData,
    sucursales,
    areas,
    areasDeSucursales,
    loading,
    getSucursalCajas,
    globalSucursal,
    globalArea,
    ensureMonths,
  } = useAppContext();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  // [] = todas / todos
  const [selectedAreas, setSelectedAreas] = useState<string[]>(
    globalArea && globalArea !== 'Todas' ? [globalArea] : []
  );

  const DATES = useMemo(
    () => getDatesForMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = getDatesForMonth(now.getFullYear(), now.getMonth());
    const todayVal = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    return today.find((d) => d.value === todayVal)?.value || today[0]?.value || '';
  });
  const [selectedSucursales, setSelectedSucursales] = useState<string[]>(
    globalSucursal && globalSucursal !== 'Todas' ? [globalSucursal] : []
  );
  const [selectedCargos, setSelectedCargos] = useState<string[]>([]);

  // El mes elegido puede no estar cargado todavía (solo se cargan los cercanos)
  useEffect(() => {
    ensureMonths([`${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`]);
  }, [selectedYear, selectedMonth, ensureMonths]);

  useEffect(() => {
    if (globalArea && globalArea !== 'Todas') setSelectedAreas([globalArea]);
  }, [globalArea]);

  useEffect(() => {
    setSelectedSucursales(globalSucursal && globalSucursal !== 'Todas' ? [globalSucursal] : []);
  }, [globalSucursal]);

  const cargoOptions = useCargoOptions(selectedAreas, selectedCargos, setSelectedCargos);

  // Sucursales que cuentan: las elegidas o, sin ninguna, todas las que se ven
  // Solo las áreas que hay en las sucursales elegidas
  const areaOptions = useMemo(
    () => areasDeSucursales(selectedSucursales),
    [areasDeSucursales, selectedSucursales]
  );
  useEffect(() => {
    if (loading) return;
    setSelectedAreas((prev) => {
      const kept = prev.filter((a) => areaOptions.includes(a));
      return kept.length === prev.length ? prev : kept;
    });
  }, [loading, areaOptions]);

  const sucursalList = useMemo(
    () => (selectedSucursales.length > 0 ? selectedSucursales : sucursales.map((s) => s.name)),
    [selectedSucursales, sucursales]
  );

  const filteredWorkers = useMemo(
    () =>
      workers.filter(
        (w) =>
          sucursalList.includes(w.sucursal) &&
          w.estado === 'Activo' &&
          (selectedAreas.length > 0 ? selectedAreas : areas).includes(w.area) &&
          (selectedCargos.length === 0 || selectedCargos.includes(w.cargo))
      ),
    [workers, sucursalList, selectedAreas, areas, selectedCargos]
  );

  const cajasCount = useMemo(
    () => sucursalList.reduce((sum, name) => sum + getSucursalCajas(name), 0),
    [sucursalList, getSucursalCajas]
  );
  // Las cajas vacías solo tienen sentido mirando a las cajeras
  const isCajeras = selectedCargos.length === 1 && selectedCargos[0] === 'Cajera';

  useEffect(() => {
    const newDates = getDatesForMonth(selectedYear, selectedMonth);
    const today = new Date();
    const isCurrentMonthYear =
      selectedYear === today.getFullYear() && selectedMonth === today.getMonth();
    if (isCurrentMonthYear) {
      const todayVal = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
      setSelectedDate(
        newDates.find((d) => d.value === todayVal)?.value || newDates[0]?.value || ''
      );
    } else {
      setSelectedDate(newDates[0]?.value || '');
    }
  }, [selectedYear, selectedMonth]);

  const dayIndex = useMemo(() => {
    const idx = DATES.findIndex((d) => d.value === selectedDate);
    return idx >= 0 ? idx : 0;
  }, [selectedDate, DATES]);

  const birthdayWorkers = useMemo(() => {
    return workers
      .filter((w) => {
        if (!w.birthday) return false;
        const [, bMonth] = w.birthday.split('-').map(Number);
        if (bMonth !== selectedMonth + 1) return false;
        if (selectedAreas.length > 0 && !selectedAreas.includes(w.area)) return false;
        return true;
      })
      .sort((a, b) => {
        const [, , aDay] = (a.birthday || '').split('-').map(Number);
        const [, , bDay] = (b.birthday || '').split('-').map(Number);
        return aDay - bDay;
      });
  }, [workers, selectedMonth, selectedAreas]);

  const hourlySummary = useMemo((): HourlySummary[] => {
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const monthKey = monthLabelToKey(monthLabel);
    const monthSched = scheduleData[monthKey] || {};
    const slotHour = (time: string) => parseInt(time.split(':')[0], 10);
    return HOUR_SLOTS.map((hour) => {
      const slotH = slotHour(hour);
      let entering = 0,
        exiting = 0,
        active = 0;
      filteredWorkers.forEach((w) => {
        const shiftCode = (monthSched[w.id] || [])[dayIndex];
        if (!shiftCode || shiftCode === 'DESC') return;
        const shift = shifts[shiftCode];
        if (!shift) return;
        const startH = slotHour(shift.start);
        const endH = slotHour(shift.end);
        if (startH === slotH) entering++;
        if (endH === slotH) exiting++;
        if (startH <= slotH && endH > slotH) active++;
      });
      const vacantCajas = isCajeras ? Math.max(0, cajasCount - active) : 0;
      return { hour, entering, exiting, active, vacantCajas };
    }).filter((s) => s.entering > 0 || s.exiting > 0 || s.active > 0);
  }, [
    filteredWorkers,
    shifts,
    scheduleData,
    dayIndex,
    selectedMonth,
    selectedYear,
    cajasCount,
    isCajeras,
  ]);

  // Gente por pasillo y por bodega: una tabla por sucursal, solo si según los filtros hay
  // alguien con pasillo (o bodega) en ella. Así cada cargo ve lo suyo.
  const lugarTablas = useMemo(
    () =>
      (['pasillo', 'bodega'] as const).flatMap((tipo) =>
        sucursales
          .filter(
            (s) =>
              sucursalList.includes(s.name) &&
              filteredWorkers.some((w) => w.sucursal === s.name && w[tipo])
          )
          .map((s) => ({
            tipo,
            sucursal: s.name,
            lugares: tipo === 'pasillo' ? s.pasillos : s.bodegas,
          }))
      ),
    [sucursales, sucursalList, filteredWorkers]
  );
  const monthSched = useMemo(
    () => scheduleData[monthLabelToKey(`${MONTH_NAMES[selectedMonth]} ${selectedYear}`)] || {},
    [scheduleData, selectedMonth, selectedYear]
  );

  const totalWorkers = useMemo(() => {
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const monthKey = monthLabelToKey(monthLabel);
    const monthSched = scheduleData[monthKey] || {};
    return filteredWorkers.filter(
      (w) => monthSched[w.id]?.[dayIndex] && monthSched[w.id]?.[dayIndex] !== 'DESC'
    ).length;
  }, [filteredWorkers, scheduleData, dayIndex, selectedMonth, selectedYear]);

  const totalResting = useMemo(() => {
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const monthKey = monthLabelToKey(monthLabel);
    const monthSched = scheduleData[monthKey] || {};
    return filteredWorkers.filter((w) => monthSched[w.id]?.[dayIndex] === 'DESC').length;
  }, [filteredWorkers, scheduleData, dayIndex, selectedMonth, selectedYear]);

  const selectedDateLabel = DATES.find((d) => d.value === selectedDate)?.label || '';
  const yearOptions = [2026, 2027, 2028, 2029, 2030];

  return (
    <div className="p-4 lg:p-6 xl:p-8 max-w-screen-2xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">
            Resumen operativo de turnos y personal
          </p>
        </div>
        <div
          className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2 text-sm text-muted-foreground"
          style={{ boxShadow: 'var(--shadow-sm)' }}
        >
          <Calendar size={14} className="text-secondary" />
          <span className="font-semibold text-foreground text-xs">{selectedDateLabel}</span>
        </div>
      </div>

      {/* Birthday alerts */}
      {birthdayWorkers.length > 0 && (
        <div
          className="rounded-2xl p-4 mb-6 border"
          style={{
            background: 'linear-gradient(135deg, #fff0f6 0%, #fdf2f8 100%)',
            borderColor: '#f9a8d4',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-pink-100 flex items-center justify-center">
              <Cake size={15} className="text-pink-500" />
            </div>
            <span className="text-sm font-bold text-pink-700 uppercase tracking-wider">
              Cumpleaños — {MONTH_NAMES[selectedMonth]}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {birthdayWorkers.map((w) => {
              const [, , bDay] = (w.birthday || '').split('-').map(Number);
              return (
                <div
                  key={w.id}
                  className="flex items-center gap-2.5 bg-white/80 border border-pink-100 rounded-xl px-3 py-2 shadow-sm"
                >
                  <div className="w-8 h-8 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {w.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground leading-tight">{w.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.role || w.cargo} · {w.sucursal}
                    </p>
                    <p className="text-xs text-pink-500 font-semibold">
                      🎂 {bDay} de {MONTH_NAMES[selectedMonth]}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter + summary panel */}
      <div
        className="bg-card rounded-2xl border border-border p-6 mb-0"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="w-7 h-7 rounded-lg bg-secondary/10 flex items-center justify-center">
            <TrendingUp size={14} className="text-secondary" />
          </div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Resumen del día
          </h2>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-6">
          {/* Year */}
          <div className="min-w-[120px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Año
            </label>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none pr-8 transition-colors hover:border-secondary/40"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
          {/* Month */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Mes
            </label>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none pr-8 transition-colors hover:border-secondary/40"
              >
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
          {/* Day */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Fecha
            </label>
            <div className="relative">
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none pr-8 transition-colors hover:border-secondary/40"
              >
                {DATES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
          <MultiSelect
            label="Sucursal"
            options={sucursales.map((s) => s.name)}
            selected={selectedSucursales}
            onChange={setSelectedSucursales}
            allLabel="Todas"
            className="flex-1 min-w-[200px] max-w-[320px]"
            labelClassName={MULTI_LABEL}
            buttonClassName={MULTI_BUTTON}
          />
          <MultiSelect
            label="Área"
            options={areaOptions}
            selected={selectedAreas}
            onChange={setSelectedAreas}
            allLabel="Todas las áreas"
            className="min-w-[160px] max-w-[280px]"
            labelClassName={MULTI_LABEL}
            buttonClassName={MULTI_BUTTON}
          />
          <MultiSelect
            label="Cargo"
            options={cargoOptions}
            selected={selectedCargos}
            onChange={setSelectedCargos}
            allLabel="Todos"
            className="min-w-[180px] max-w-[280px]"
            labelClassName={MULTI_LABEL}
            buttonClassName={MULTI_BUTTON}
          />
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div
            className="kpi-card rounded-2xl p-4 flex items-center gap-3 border"
            style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              borderColor: '#bfdbfe',
            }}
          >
            <div className="hidden lg:flex w-11 h-11 rounded-xl bg-blue-100 items-center justify-center shrink-0">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-blue-700 leading-none">{totalWorkers}</p>
              <p className="text-xs text-blue-500 font-semibold mt-1">Trabajando hoy</p>
            </div>
          </div>
          <div
            className="kpi-card rounded-2xl p-4 flex items-center gap-3 border"
            style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              borderColor: '#bbf7d0',
            }}
          >
            <div className="hidden lg:flex w-11 h-11 rounded-xl bg-green-100 items-center justify-center shrink-0">
              <UserCheck size={18} className="text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-green-700 leading-none">{totalResting}</p>
              <p className="text-xs text-green-500 font-semibold mt-1">Descansando</p>
            </div>
          </div>
          <div
            className="kpi-card rounded-2xl p-4 flex items-center gap-3 border"
            style={{
              background: 'linear-gradient(135deg, #fff7ed 0%, #fed7aa 100%)',
              borderColor: '#fdba74',
            }}
          >
            <div className="hidden lg:flex w-11 h-11 rounded-xl bg-orange-100 items-center justify-center shrink-0">
              <Package size={18} className="text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-orange-600 leading-none">{cajasCount}</p>
              <p className="text-xs text-orange-400 font-semibold mt-1">Cajas disponibles</p>
            </div>
          </div>
          <div
            className="kpi-card rounded-2xl p-4 flex items-center gap-3 border"
            style={{
              background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
              borderColor: '#ddd6fe',
            }}
          >
            <div className="hidden lg:flex w-11 h-11 rounded-xl bg-purple-100 items-center justify-center shrink-0">
              <Clock size={18} className="text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-purple-700 leading-none">
                {hourlySummary.length}
              </p>
              <p className="text-xs text-purple-400 font-semibold mt-1">Franjas horarias</p>
            </div>
          </div>
        </div>

        {/* Personas por hora: gráfico de barras compacto */}
        {hourlySummary.length > 0 ? (
          (() => {
            const maxActive = Math.max(1, ...hourlySummary.map((r) => r.active));
            return (
              <div
                className="rounded-xl border border-border p-4"
                style={{ boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Personas por hora
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <span className="w-2.5 h-2.5 rounded-sm bg-blue-500" /> Trabajando
                    </span>
                    <span className="text-green-600 font-semibold">+ entran</span>
                    <span className="text-red-500 font-semibold">− salen</span>
                    {isCajeras && (
                      <span className="text-orange-500 font-semibold">cajas vacías</span>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div
                    className="grid gap-1 min-w-[560px]"
                    style={{
                      gridTemplateColumns: `repeat(${hourlySummary.length}, minmax(0, 1fr))`,
                    }}
                  >
                    {hourlySummary.map((row) => (
                      <div
                        key={row.hour}
                        className="flex flex-col items-center"
                        title={`${row.hour}: ${row.active} trabajando, ${row.entering} entran, ${row.exiting} salen${isCajeras ? `, ${row.vacantCajas} cajas vacías` : ''}`}
                      >
                        <span className="text-xs font-bold text-blue-700 font-tabular">
                          {row.active}
                        </span>
                        <div className="w-full h-28 flex items-end justify-center">
                          <div
                            className="w-full max-w-[28px] rounded-t-md bg-blue-500"
                            style={{
                              height: `${Math.max(4, (row.active / maxActive) * 100)}%`,
                              opacity: row.active === 0 ? 0.25 : 1,
                            }}
                          />
                        </div>
                        <span className="mt-1 text-[11px] font-semibold text-foreground font-tabular">
                          {row.hour.slice(0, 2)}
                        </span>
                        <span className="text-[10px] leading-tight font-semibold text-green-600 h-3.5">
                          {row.entering > 0 ? `+${row.entering}` : ''}
                        </span>
                        <span className="text-[10px] leading-tight font-semibold text-red-500 h-3.5">
                          {row.exiting > 0 ? `−${row.exiting}` : ''}
                        </span>
                        {isCajeras && (
                          <span
                            className={`text-[10px] leading-tight font-semibold h-3.5 ${row.vacantCajas > 5 ? 'text-orange-500' : 'text-slate-400'}`}
                          >
                            {row.vacantCajas}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm rounded-xl border border-dashed border-border">
            <Calendar size={28} className="mx-auto mb-2 text-muted-foreground/40" />
            No hay turnos asignados para esta fecha y sucursal.
          </div>
        )}

        {lugarTablas.map((t) => (
          <CoberturaLugares
            key={`${t.tipo}-${t.sucursal}`}
            tipo={t.tipo}
            sucursal={t.sucursal}
            lugares={t.lugares}
            workers={filteredWorkers}
            monthSched={monthSched}
            shifts={shifts}
            dayIndex={dayIndex}
          />
        ))}
      </div>
    </div>
  );
}

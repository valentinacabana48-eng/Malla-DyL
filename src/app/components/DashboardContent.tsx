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
import AppImage from '@/components/ui/AppImage';
import { useAppContext, monthLabelToKey } from '@/context/AppContext';

const BRANCH_LOGOS = [
  {
    id: 'logo-distribuidora',
    src: '/assets/images/descarga__2_-1784608577889.png',
    alt: 'Distribuidora DyL - logo azul y amarillo',
    label: 'Distribuidora DyL',
  },
  {
    id: 'logo-mayorista',
    src: '/assets/images/descarga__1_-1784608578251.png',
    alt: 'Mayorista DyL - logo rojo y naranja',
    label: 'Mayorista DyL',
  },
  {
    id: 'logo-envases',
    src: '/assets/images/descarga-1784608578238.png',
    alt: 'Envases DyL - logo verde y naranja',
    label: 'Envases DyL',
  },
];

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
  const { workers, shifts, scheduleData, sucursales, areas, getSucursalCajas, globalSucursal } =
    useAppContext();

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [areaFilter, setAreaFilter] = useState('all');

  const DATES = useMemo(
    () => getDatesForMonth(selectedYear, selectedMonth),
    [selectedYear, selectedMonth]
  );

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = getDatesForMonth(now.getFullYear(), now.getMonth());
    const todayVal = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    return today.find((d) => d.value === todayVal)?.value || today[0]?.value || '';
  });
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [selectedCargo, setSelectedCargo] = useState('Cajera');

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

  useEffect(() => {
    if (globalSucursal && globalSucursal !== 'Todas') {
      setSelectedSucursal(globalSucursal);
    } else if (sucursales.length > 0) {
      setSelectedSucursal(sucursales[0].name);
    }
  }, [globalSucursal, sucursales]);

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
        if (areaFilter !== 'all' && w.area !== areaFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const [, , aDay] = (a.birthday || '').split('-').map(Number);
        const [, , bDay] = (b.birthday || '').split('-').map(Number);
        return aDay - bDay;
      });
  }, [workers, selectedMonth, areaFilter]);

  const hourlySummary = useMemo((): HourlySummary[] => {
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const monthKey = monthLabelToKey(monthLabel);
    const monthSched = scheduleData[monthKey] || {};
    let sucursalWorkers = workers.filter(
      (w) => w.sucursal === selectedSucursal && w.estado === 'Activo'
    );
    if (selectedCargo === 'Cajera') {
      sucursalWorkers = sucursalWorkers.filter((w) => w.cargo === 'Cajera');
    } else if (selectedCargo === 'Jefa de Caja') {
      sucursalWorkers = sucursalWorkers.filter((w) => w.cargo === 'Jefa de Caja');
    }
    const cajasCount = getSucursalCajas(selectedSucursal);
    const isCajeras = selectedCargo === 'Cajera';
    const slotHour = (time: string) => parseInt(time.split(':')[0], 10);
    return HOUR_SLOTS.map((hour) => {
      const slotH = slotHour(hour);
      let entering = 0,
        exiting = 0,
        active = 0;
      sucursalWorkers.forEach((w) => {
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
    workers,
    shifts,
    scheduleData,
    dayIndex,
    selectedSucursal,
    selectedMonth,
    selectedYear,
    getSucursalCajas,
    selectedCargo,
  ]);

  const totalWorkers = useMemo(() => {
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const monthKey = monthLabelToKey(monthLabel);
    const monthSched = scheduleData[monthKey] || {};
    return workers.filter(
      (w) =>
        w.sucursal === selectedSucursal &&
        w.estado === 'Activo' &&
        monthSched[w.id]?.[dayIndex] &&
        monthSched[w.id]?.[dayIndex] !== 'DESC'
    ).length;
  }, [workers, scheduleData, dayIndex, selectedSucursal, selectedMonth, selectedYear]);

  const totalResting = useMemo(() => {
    const monthLabel = `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;
    const monthKey = monthLabelToKey(monthLabel);
    const monthSched = scheduleData[monthKey] || {};
    return workers.filter(
      (w) => w.sucursal === selectedSucursal && monthSched[w.id]?.[dayIndex] === 'DESC'
    ).length;
  }, [workers, scheduleData, dayIndex, selectedSucursal, selectedMonth, selectedYear]);

  const selectedDateLabel = DATES.find((d) => d.value === selectedDate)?.label || '';
  const yearOptions = [2026, 2027, 2028, 2029, 2030];

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
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

      {/* Brand logos — consistent with app design */}
      <div
        className="bg-card rounded-2xl border border-border mb-6 overflow-hidden"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        {/* Header strip */}
        <div
          className="px-6 py-4 border-b border-border flex items-center justify-between"
          style={{ background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)' }}
        >
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-0.5">
              Grupo Empresarial
            </p>
            <h2 className="text-base font-extrabold text-foreground tracking-tight">
              DyL Empresas
            </h2>
          </div>
          <div className="h-6 w-px rounded-full" style={{ background: 'var(--border)' }} />
          <p className="text-xs text-muted-foreground font-medium hidden lg:block">
            Gestión integrada de personal y turnos
          </p>
        </div>

        {/* Logo cards */}
        <div className="px-4 lg:px-6 py-5 lg:py-6 grid grid-cols-3 gap-3 lg:flex lg:flex-wrap lg:gap-5 lg:justify-center lg:items-stretch">
          {BRANCH_LOGOS.map((logo) => (
            <div key={logo.id} className="group flex flex-col items-center gap-3 cursor-default">
              {/* Card */}
              <div
                className="relative flex items-center justify-center rounded-2xl p-2 lg:p-4 border border-border transition-all duration-200 group-hover:border-secondary/40 w-full h-20 lg:w-[160px] lg:h-[110px]"
                style={{
                  background: '#ffffff',
                  boxShadow: '0 2px 8px rgba(15,39,68,0.06)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    '0 12px 32px rgba(37,99,235,0.12), 0 2px 8px rgba(15,39,68,0.06)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLDivElement).style.boxShadow =
                    '0 2px 8px rgba(15,39,68,0.06)';
                }}
              >
                <AppImage
                  src={logo.src}
                  alt={logo.alt}
                  width={130}
                  height={85}
                  className="object-contain w-full h-full"
                />
              </div>
              {/* Label */}
              <span className="text-xs font-semibold text-muted-foreground tracking-wide text-center">
                {logo.label}
              </span>
            </div>
          ))}
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
          {/* Sucursal */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Sucursal
            </label>
            <div className="relative">
              <select
                value={selectedSucursal}
                onChange={(e) => setSelectedSucursal(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none pr-8 transition-colors hover:border-secondary/40"
              >
                {sucursales.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
          {/* Cargo */}
          <div className="min-w-[180px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Cargo
            </label>
            <div className="relative">
              <select
                value={selectedCargo}
                onChange={(e) => setSelectedCargo(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none pr-8 transition-colors hover:border-secondary/40"
              >
                <option value="Todos">Todos</option>
                <option value="Cajera">Cajera</option>
                <option value="Jefa de Caja">Jefa de Caja</option>
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
          {/* Área */}
          <div className="min-w-[160px]">
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Área
            </label>
            <div className="relative">
              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value)}
                className="w-full px-3 py-2.5 bg-input border border-border rounded-xl text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring appearance-none pr-8 transition-colors hover:border-secondary/40"
              >
                <option value="all">Todas las áreas</option>
                {areas.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={13}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
            </div>
          </div>
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
              <p className="text-2xl font-extrabold text-orange-600 leading-none">
                {getSucursalCajas(selectedSucursal)}
              </p>
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

        {/* Hourly table */}
        {hourlySummary.length > 0 ? (
          <div
            className="overflow-x-auto rounded-xl border border-border"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    background: 'linear-gradient(90deg, #f8fafc 0%, #f1f5f9 100%)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <th className="text-left px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Hora
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-green-600 uppercase tracking-wider">
                    Entran
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-red-500 uppercase tracking-wider">
                    Salen
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-bold text-blue-600 uppercase tracking-wider">
                    Activas
                  </th>
                  {selectedCargo === 'Cajera' && (
                    <th className="text-center px-4 py-3 text-xs font-bold text-orange-500 uppercase tracking-wider">
                      Cajas vacías
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {hourlySummary.map((row, i) => (
                  <tr
                    key={row.hour}
                    className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${i % 2 === 0 ? '' : 'bg-muted/[0.03]'}`}
                  >
                    <td className="px-4 py-3 font-bold text-foreground font-tabular">{row.hour}</td>
                    <td className="px-4 py-3 text-center">
                      {row.entering > 0 ? (
                        <span className="inline-flex items-center justify-center w-8 h-7 rounded-lg bg-green-100 text-green-700 font-bold text-sm">
                          {row.entering}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.exiting > 0 ? (
                        <span className="inline-flex items-center justify-center w-8 h-7 rounded-lg bg-red-100 text-red-600 font-bold text-sm">
                          {row.exiting}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-sm">
                        {row.active}
                      </span>
                    </td>
                    {selectedCargo === 'Cajera' && (
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center w-8 h-7 rounded-lg font-bold text-sm ${row.vacantCajas > 5 ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'}`}
                        >
                          {row.vacantCajas}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm rounded-xl border border-dashed border-border">
            <Calendar size={28} className="mx-auto mb-2 text-muted-foreground/40" />
            No hay turnos asignados para esta fecha y sucursal.
          </div>
        )}
      </div>
    </div>
  );
}

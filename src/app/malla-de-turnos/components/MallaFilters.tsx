'use client';
import React, { useState, useEffect } from 'react';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  Briefcase,
  Search,
  Hash,
  SlidersHorizontal,
} from 'lucide-react';
import { MESES, useAppContext } from '@/context/AppContext';
import MultiSelect from '@/components/ui/MultiSelect';
import { useCargoOptions } from '@/hooks/useCargoOptions';

interface Props {
  selectedMes: string;
  setSelectedMes: (v: string) => void;
  /** [] = todas */
  selectedAreas: string[];
  setSelectedAreas: (v: string[]) => void;
  /** [] = todas */
  selectedSucursales: string[];
  setSelectedSucursales: (v: string[]) => void;
  selectedTurno: string;
  setSelectedTurno: (v: string) => void;
  turnoOptions: string[];
  /** [] = todos */
  selectedCargos: string[];
  setSelectedCargos: (v: string[]) => void;
  selectedHoras: string[];
  setSelectedHoras: (v: string[]) => void;
  nameSearch: string;
  setNameSearch: (v: string) => void;
}

function FilterSelect({
  label,
  icon: IconComp,
  value,
  onChange,
  options,
  className = 'flex flex-col gap-1 min-w-[160px]',
  labelClassName = 'text-[11px] font-semibold tracking-widest text-muted-foreground uppercase',
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
  labelClassName?: string;
}) {
  const Icon = IconComp as React.ElementType;
  return (
    <div className={className}>
      <span className={labelClassName}>{label}</span>
      <div className="relative">
        <Icon
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-8 pr-8 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
        >
          {options.map((opt) => (
            <option key={`opt-${opt}`} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          ▾
        </div>
      </div>
    </div>
  );
}

const HORAS_OPTIONS = ['10 hrs', '20 hrs', '30 hrs', '42 hrs', '45 hrs'];

export default function MallaFilters({
  selectedMes,
  setSelectedMes,
  selectedAreas,
  setSelectedAreas,
  selectedSucursales,
  setSelectedSucursales,
  selectedTurno,
  setSelectedTurno,
  turnoOptions,
  selectedCargos,
  setSelectedCargos,
  selectedHoras,
  setSelectedHoras,
  nameSearch,
  setNameSearch,
}: Props) {
  const { sucursales, areas } = useAppContext();

  const [clientSucursales, setClientSucursales] = useState<string[]>([]);
  const [clientAreas, setClientAreas] = useState<string[]>([]);
  const [clientTurnoOptions, setClientTurnoOptions] = useState<string[]>(['Todos']);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setClientSucursales(sucursales.map((s) => s.name));
    setClientAreas(areas);
    setClientTurnoOptions(turnoOptions);
    setMounted(true);
  }, [sucursales, areas, turnoOptions]);

  // Cargos de las áreas elegidas
  const cargoOptions = useCargoOptions(selectedAreas, selectedCargos, setSelectedCargos);

  // En el celular solo se ven el mes y el buscador; el resto va en "Más filtros"
  const [showMore, setShowMore] = useState(false);
  const activeCount =
    (selectedAreas.length > 0 ? 1 : 0) +
    (selectedSucursales.length > 0 ? 1 : 0) +
    (selectedCargos.length > 0 ? 1 : 0) +
    (selectedTurno !== 'Todos' ? 1 : 0) +
    (selectedHoras.length > 0 ? 1 : 0);
  const multiClass = 'flex flex-col gap-1 min-w-[160px] lg:max-w-[260px]';
  const mobileLabel =
    'hidden lg:block text-[11px] font-semibold tracking-widest text-muted-foreground uppercase';

  return (
    <div className="bg-card rounded-xl border border-border p-3 lg:p-4 shadow-sm flex flex-wrap gap-2 lg:gap-4 items-end">
      <FilterSelect
        label="Mes"
        icon={Calendar}
        value={selectedMes}
        onChange={setSelectedMes}
        options={MESES}
        className="flex flex-col gap-1 flex-1 min-w-0 lg:flex-none lg:min-w-[160px]"
        labelClassName={mobileLabel}
      />
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="lg:hidden flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-foreground"
      >
        <SlidersHorizontal size={15} />
        Más filtros
        {activeCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-secondary text-white text-[11px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>
      <div
        className={`${showMore ? 'flex' : 'hidden'} order-last w-full flex-col gap-3 pt-2 lg:contents`}
      >
        <MultiSelect
          label="Área"
          icon={Users}
          options={mounted ? clientAreas : []}
          selected={selectedAreas}
          onChange={setSelectedAreas}
          allLabel="Todas"
          className={multiClass}
        />
        <MultiSelect
          label="Sucursal"
          icon={MapPin}
          options={mounted ? clientSucursales : []}
          selected={selectedSucursales}
          onChange={setSelectedSucursales}
          allLabel="Todas"
          className={multiClass}
        />
        <MultiSelect
          label="Cargo"
          icon={Briefcase}
          options={mounted ? cargoOptions : []}
          selected={selectedCargos}
          onChange={setSelectedCargos}
          allLabel="Todos"
          className={multiClass}
        />
        <FilterSelect
          label="Turnos disponibles"
          icon={Clock}
          value={selectedTurno}
          onChange={setSelectedTurno}
          options={mounted ? clientTurnoOptions : ['Todos']}
        />
        {/* Multi-select contracted hours filter */}
        <MultiSelect
          label="Horas contratadas"
          icon={Hash}
          options={HORAS_OPTIONS}
          selected={selectedHoras}
          onChange={setSelectedHoras}
          allLabel="Todas"
          className={multiClass}
        />
        <button
          type="button"
          onClick={() => setShowMore(false)}
          className="lg:hidden w-full py-2.5 rounded-lg bg-secondary text-white text-sm font-semibold"
        >
          Listo
        </button>
      </div>
      {/* Name search */}
      <div className="flex flex-col gap-1 w-full lg:w-auto lg:min-w-[180px]">
        <span className={mobileLabel}>Buscar nombre</span>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Nombre del trabajador..."
            className="w-full pl-8 pr-3 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}

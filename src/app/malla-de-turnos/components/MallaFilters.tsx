'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Calendar, MapPin, Users, Clock, Briefcase, Search, Hash } from 'lucide-react';
import { MESES, useAppContext } from '@/context/AppContext';

interface Props {
  selectedMes: string;
  setSelectedMes: (v: string) => void;
  selectedArea: string;
  setSelectedArea: (v: string) => void;
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
}: {
  label: string;
  icon: React.ElementType;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const Icon = IconComp as React.ElementType;
  return (
    <div className="flex flex-col gap-1 min-w-[160px]">
      <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
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

/** Selector con casillas para elegir varias opciones; sin ninguna marcada = todas */
function MultiSelect({
  label,
  icon: IconComp,
  options,
  selected,
  onChange,
  allLabel,
}: {
  label: string;
  icon: React.ElementType;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const IconEl = IconComp as React.ElementType;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((h) => h !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const buttonLabel =
    selected.length === 0 || selected.length === options.length ? allLabel : selected.join(', ');

  return (
    <div className="flex flex-col gap-1 min-w-[160px] max-w-[260px]" ref={ref}>
      <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
        {label}
      </span>
      <div className="relative">
        <IconEl
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={buttonLabel}
          className="w-full pl-8 pr-8 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground text-left focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer truncate"
        >
          {buttonLabel}
        </button>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          ▾
        </div>

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 w-full bg-card border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-72 overflow-y-auto">
            <label className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={selected.length === 0}
                onChange={() => onChange([])}
                className="accent-primary"
              />
              {allLabel}
            </label>
            <div className="border-t border-border my-1" />
            {options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer text-sm font-medium text-foreground"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-primary"
                />
                {opt}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MallaFilters({
  selectedMes,
  setSelectedMes,
  selectedArea,
  setSelectedArea,
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
  const { sucursales, areas, workers } = useAppContext();

  const [clientSucursales, setClientSucursales] = useState<string[]>([]);
  const [clientAreas, setClientAreas] = useState<string[]>(['Todas']);
  const [clientTurnoOptions, setClientTurnoOptions] = useState<string[]>(['Todos']);
  const [clientCargoOptions, setClientCargoOptions] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setClientSucursales(sucursales.map((s) => s.name));
    setClientAreas(['Todas', ...areas]);
    setClientTurnoOptions(turnoOptions);
    const uniqueCargos = Array.from(new Set(workers.map((w) => w.cargo).filter(Boolean))).sort();
    setClientCargoOptions(uniqueCargos);
    setMounted(true);
  }, [sucursales, areas, turnoOptions, workers]);

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-wrap gap-4 items-end">
      <FilterSelect
        label="Mes"
        icon={Calendar}
        value={selectedMes}
        onChange={setSelectedMes}
        options={MESES}
      />
      <FilterSelect
        label="Área"
        icon={Users}
        value={selectedArea}
        onChange={setSelectedArea}
        options={mounted ? clientAreas : ['Todas']}
      />
      <MultiSelect
        label="Sucursal"
        icon={MapPin}
        options={mounted ? clientSucursales : []}
        selected={selectedSucursales}
        onChange={setSelectedSucursales}
        allLabel="Todas"
      />
      <MultiSelect
        label="Cargo"
        icon={Briefcase}
        options={mounted ? clientCargoOptions : []}
        selected={selectedCargos}
        onChange={setSelectedCargos}
        allLabel="Todos"
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
      />
      {/* Name search */}
      <div className="flex flex-col gap-1 min-w-[180px]">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Buscar nombre
        </span>
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

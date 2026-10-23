'use client';
import React from 'react';
import { MapPin, Users, Search, Briefcase } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import MultiSelect from '@/components/ui/MultiSelect';

interface Props {
  /** [] = todas */
  filterSucursales: string[];
  setFilterSucursales: (v: string[]) => void;
  /** [] = todas */
  filterAreas: string[];
  setFilterAreas: (v: string[]) => void;
  filterEstado: string;
  setFilterEstado: (v: string) => void;
  /** [] = todos */
  filterCargos: string[];
  setFilterCargos: (v: string[]) => void;
  cargoOptions: string[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

const MULTI_WRAPPER = 'flex flex-col gap-1 w-full lg:w-auto lg:min-w-[160px] lg:max-w-[260px]';
const MULTI_BUTTON =
  'w-full py-3 lg:py-2 bg-card border border-border rounded-lg text-base lg:text-sm font-medium';

export default function PersonalFilters({
  filterSucursales,
  setFilterSucursales,
  filterAreas,
  setFilterAreas,
  filterEstado,
  setFilterEstado,
  filterCargos,
  setFilterCargos,
  cargoOptions,
  searchQuery,
  setSearchQuery,
}: Props) {
  const { sucursales, areas } = useAppContext();

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-wrap gap-3 lg:gap-4 items-end">
      <MultiSelect
        label="Sucursal"
        icon={MapPin}
        options={sucursales.map((s) => s.name)}
        selected={filterSucursales}
        onChange={setFilterSucursales}
        allLabel="Todas"
        className={MULTI_WRAPPER}
        buttonClassName={MULTI_BUTTON}
      />
      <MultiSelect
        label="Área"
        icon={Users}
        options={areas}
        selected={filterAreas}
        onChange={setFilterAreas}
        allLabel="Todas"
        className={MULTI_WRAPPER}
        buttonClassName={MULTI_BUTTON}
      />
      <MultiSelect
        label="Cargo"
        icon={Briefcase}
        options={cargoOptions}
        selected={filterCargos}
        onChange={setFilterCargos}
        allLabel="Todos"
        className={MULTI_WRAPPER}
        buttonClassName={MULTI_BUTTON}
      />
      {/* Estado */}
      <div className="flex flex-col gap-1 w-full lg:w-auto lg:min-w-[130px]">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Estado
        </span>
        <div className="relative">
          <div className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 pointer-events-none" />
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value)}
            className="w-full pl-8 pr-6 py-3 lg:py-2 bg-card border border-border rounded-lg text-base lg:text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {['Todos', 'Activos', 'Inactivos'].map((e) => (
              <option key={`fe-${e}`} value={e}>
                {e}
              </option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground text-xs">
            ▾
          </div>
        </div>
      </div>
      {/* Search */}
      <div className="flex flex-col gap-1 w-full lg:w-auto flex-1 lg:min-w-[180px]">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Buscar trabajador
        </span>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Nombre o RUT..."
            className="w-full pl-8 pr-3 py-3 lg:py-2 bg-card border border-border rounded-lg text-base lg:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
          />
        </div>
      </div>
    </div>
  );
}

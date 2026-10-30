'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Users, Search, Briefcase, SlidersHorizontal } from 'lucide-react';
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
  const { sucursales, areasDeSucursales, loading } = useAppContext();
  // Solo las áreas que hay en las sucursales elegidas
  const areas = useMemo(
    () => areasDeSucursales(filterSucursales),
    [areasDeSucursales, filterSucursales]
  );
  useEffect(() => {
    if (loading) return;
    const kept = filterAreas.filter((a) => areas.includes(a));
    if (kept.length !== filterAreas.length) setFilterAreas(kept);
  }, [loading, areas, filterAreas, setFilterAreas]);

  // En el celular solo se ve el buscador; el resto va en "Filtros" (como en la Malla)
  const [showMore, setShowMore] = useState(false);
  const activeCount =
    (filterSucursales.length > 0 ? 1 : 0) +
    (filterAreas.length > 0 ? 1 : 0) +
    (filterCargos.length > 0 ? 1 : 0) +
    (filterEstado !== 'Activos' ? 1 : 0);

  return (
    <div className="bg-card rounded-xl border border-border p-3 lg:p-4 shadow-sm flex flex-wrap gap-2 lg:gap-4 items-end">
      <button
        type="button"
        onClick={() => setShowMore((v) => !v)}
        aria-expanded={showMore}
        className="lg:hidden order-2 flex items-center gap-1.5 px-3 py-3 rounded-lg border border-border bg-card text-sm font-semibold text-foreground"
      >
        <SlidersHorizontal size={15} />
        Filtros
        {activeCount > 0 && (
          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-secondary text-white text-[11px] font-bold flex items-center justify-center">
            {activeCount}
          </span>
        )}
      </button>
      <div
        className={`${showMore ? 'flex' : 'hidden'} order-3 w-full flex-col gap-3 pt-1 lg:contents`}
      >
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
      </div>
      {/* Search */}
      <div className="order-1 lg:order-none flex flex-col gap-1 min-w-0 lg:w-auto flex-1 lg:min-w-[180px]">
        <span className="hidden lg:block text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
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

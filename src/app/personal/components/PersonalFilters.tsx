'use client';
import React from 'react';
import { MapPin, Users, Search } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

interface Props {
  filterSucursal: string;
  setFilterSucursal: (v: string) => void;
  filterArea: string;
  setFilterArea: (v: string) => void;
  filterEstado: string;
  setFilterEstado: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

export default function PersonalFilters({
  filterSucursal,
  setFilterSucursal,
  filterArea,
  setFilterArea,
  filterEstado,
  setFilterEstado,
  searchQuery,
  setSearchQuery,
}: Props) {
  const { sucursales, areas } = useAppContext();
  const sucursalOptions = ['Todas', ...sucursales.map((s) => s.name)];
  const areaOptions = ['Todas', ...areas];

  return (
    <div className="bg-card rounded-xl border border-border p-4 shadow-sm flex flex-wrap gap-3 lg:gap-4 items-end">
      {/* Sucursal */}
      <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[160px]">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Sucursal
        </span>
        <div className="relative">
          <MapPin
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <select
            value={filterSucursal}
            onChange={(e) => setFilterSucursal(e.target.value)}
            className="w-full pl-8 pr-6 py-3 lg:py-2 bg-card border border-border rounded-lg text-base lg:text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {sucursalOptions.map((s) => (
              <option key={`fs-${s}`} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground text-xs">
            ▾
          </div>
        </div>
      </div>
      {/* Area */}
      <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[140px]">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Área
        </span>
        <div className="relative">
          <Users
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <select
            value={filterArea}
            onChange={(e) => setFilterArea(e.target.value)}
            className="w-full pl-8 pr-6 py-3 lg:py-2 bg-card border border-border rounded-lg text-base lg:text-sm font-medium appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {areaOptions.map((a) => (
              <option key={`fa-${a}`} value={a}>
                {a}
              </option>
            ))}
          </select>
          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground text-xs">
            ▾
          </div>
        </div>
      </div>
      {/* Estado */}
      <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[130px]">
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
      <div className="flex flex-col gap-1 w-full sm:w-auto flex-1 sm:min-w-[180px]">
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

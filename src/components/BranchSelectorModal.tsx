'use client';
import React, { useState, useEffect } from 'react';
import { MapPin, Layers, ChevronDown, ArrowRight } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import AppImage from '@/components/ui/AppImage';

const BRANCH_LOGOS = [
  {
    name: 'Distribuidora D&L',
    src: '/assets/images/descarga__2_-1784608577889.png',
    alt: 'Distribuidora DyL - logo azul y amarillo',
  },
  {
    name: 'Mayorista D&L',
    src: '/assets/images/descarga__1_-1784608578251.png',
    alt: 'Mayorista DyL - logo naranja',
  },
  {
    name: 'Envases D&L',
    src: '/assets/images/descarga-1784608578238.png',
    alt: 'Envases DyL - logo verde',
  },
];

interface BranchSelectorModalProps {
  onConfirm: (sucursal: string, area: string) => void;
}

export default function BranchSelectorModal({ onConfirm }: BranchSelectorModalProps) {
  const { sucursales, areas } = useAppContext();
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (sucursales.length > 0) setSelectedSucursal(sucursales[0].name);
    if (areas.length > 0) setSelectedArea(areas[0]);
  }, [sucursales, areas]);

  const canConfirm = selectedSucursal !== '' && selectedArea !== '';

  const handleConfirm = () => {
    if (canConfirm) onConfirm(selectedSucursal, selectedArea);
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md mx-4 overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}
      >
        {/* Header */}
        <div
          className="px-8 pt-8 pb-6 text-center"
          style={{ background: 'linear-gradient(135deg, #0a1e3d 0%, #0f2744 100%)' }}
        >
          {/* Branch logos row */}
          <div className="flex items-center justify-center gap-4 mb-5">
            {BRANCH_LOGOS.map((logo) => (
              <div
                key={logo.name}
                className="w-14 h-14 rounded-xl overflow-hidden flex items-center justify-center bg-white/10 border border-white/20 p-1"
              >
                <AppImage
                  src={logo.src}
                  alt={logo.alt}
                  width={48}
                  height={48}
                  className="object-contain w-full h-full"
                />
              </div>
            ))}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Selecciona tu sucursal</h2>
          <p className="text-sm text-white/50">Elige la sucursal y área para continuar</p>
        </div>

        {/* Body */}
        <div className="px-8 py-7 flex flex-col gap-5">
          {/* Sucursal */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
              <MapPin size={12} />
              Sucursal
            </label>
            <div className="relative">
              <select
                value={selectedSucursal}
                onChange={e => setSelectedSucursal(e.target.value)}
                className="w-full pl-4 pr-10 py-3 bg-muted/60 border border-border rounded-xl text-sm font-semibold text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer transition-colors hover:bg-muted"
              >
                {sucursales.map(s => (
                  <option key={s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Área */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold tracking-widest text-muted-foreground uppercase flex items-center gap-1.5">
              <Layers size={12} />
              Área
            </label>
            <div className="relative">
              <select
                value={selectedArea}
                onChange={e => setSelectedArea(e.target.value)}
                className="w-full pl-4 pr-10 py-3 bg-muted/60 border border-border rounded-xl text-sm font-semibold text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer transition-colors hover:bg-muted"
              >
                {areas.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Confirm button */}
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="mt-2 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: canConfirm
                ? 'linear-gradient(135deg, #1d5bd4 0%, #3b82f6 100%)'
                : undefined,
              color: canConfirm ? '#fff' : undefined,
            }}
          >
            Ingresar
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

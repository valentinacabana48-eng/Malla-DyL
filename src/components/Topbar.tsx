'use client';
import React, { useState, useEffect } from 'react';
import { Menu, MapPin, Layers, RefreshCw, Lock, Eye, LogOut } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { usePinContext } from '@/context/PinContext';

interface TopbarProps {
  onMenuToggle: () => void;
  onChangeBranch: () => void;
}

export default function Topbar({ onMenuToggle, onChangeBranch }: TopbarProps) {
  const { globalSucursal, globalArea } = useAppContext();
  const { accessLevel, logout } = usePinContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header
      className="h-14 bg-card flex items-center px-4 lg:px-6 shrink-0 gap-3"
      style={{ borderBottom: '1px solid var(--border)', boxShadow: '0 1px 4px 0 rgba(15,39,68,0.06)' }}
    >
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-muted transition-colors duration-150 text-muted-foreground hover:text-foreground"
        aria-label="Alternar menú"
      >
        <Menu size={18} />
      </button>

      {/* Global Sucursal + Área display */}
      {mounted && (
        <div className="flex items-center gap-2 ml-1 flex-1 min-w-0">
          {/* Sucursal badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg min-w-0">
            <MapPin size={13} className="text-blue-600 shrink-0" />
            <span className="text-xs font-semibold text-blue-700 truncate hidden sm:block">
              {globalSucursal === 'Todas' ? 'Sin sucursal' : globalSucursal}
            </span>
          </div>

          {/* Área badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg min-w-0">
            <Layers size={13} className="text-purple-600 shrink-0" />
            <span className="text-xs font-semibold text-purple-700 truncate hidden sm:block">
              {globalArea === 'Todas' ? 'Sin área' : globalArea}
            </span>
          </div>

          {/* Change button */}
          <button
            onClick={onChangeBranch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-150"
            title="Cambiar sucursal y área"
          >
            <RefreshCw size={12} />
            <span className="hidden sm:block">Cambiar</span>
          </button>

          {/* Access level badge */}
          {accessLevel === 'readonly' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <Eye size={13} className="text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-amber-700 hidden sm:block">Solo lectura</span>
            </div>
          )}
          {accessLevel === 'admin' && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <Lock size={13} className="text-green-600 shrink-0" />
              <span className="text-xs font-semibold text-green-700 hidden sm:block">Admin</span>
            </div>
          )}

          {/* Logout PIN button */}
          <button
            onClick={logout}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-red-600 hover:bg-red-50 border border-border transition-all duration-150"
            title="Cerrar sesión PIN"
          >
            <LogOut size={12} />
            <span className="hidden sm:block">Salir</span>
          </button>
        </div>
      )}
    </header>
  );
}
'use client';
import React, { useState, useEffect } from 'react';
import { Menu, MapPin, Layers, RefreshCw, Lock, Eye, LogOut, Download } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useInstallPrompt, useIosInstallable } from '@/lib/pwa';
import IosInstallModal from './IosInstallModal';

interface TopbarProps {
  onMenuToggle: () => void;
  onChangeBranch: () => void;
}

export default function Topbar({ onMenuToggle, onChangeBranch }: TopbarProps) {
  const { globalSucursal, globalArea } = useAppContext();
  const { role, user, signOut } = useAuth();
  const installApp = useInstallPrompt();
  // En iPhone no hay botón de instalar del navegador: se muestran los pasos a mano
  const iosInstallable = useIosInstallable();
  const [showIosInstall, setShowIosInstall] = useState(false);
  const canInstall = !!installApp || iosInstallable;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header
      className="h-16 lg:h-14 bg-card flex items-center px-3 lg:px-6 shrink-0 gap-2 lg:gap-3"
      style={{
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 4px 0 rgba(15,39,68,0.06)',
      }}
    >
      <button
        onClick={onMenuToggle}
        className="w-12 h-12 lg:w-auto lg:h-auto lg:p-2 flex items-center justify-center shrink-0 rounded-xl lg:rounded-lg hover:bg-muted transition-colors duration-150 text-foreground lg:text-muted-foreground hover:text-foreground"
        aria-label="Alternar menú"
      >
        <Menu className="w-7 h-7 lg:w-[18px] lg:h-[18px]" />
      </button>

      {/* Global Sucursal + Área display */}
      {mounted && (
        <div className="flex items-center gap-2 ml-1 flex-1 min-w-0">
          {/* Sucursal badge */}
          <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 bg-blue-50 border border-blue-200 rounded-lg min-w-0">
            <MapPin className="w-[18px] h-[18px] lg:w-[13px] lg:h-[13px] text-blue-600 shrink-0" />
            <span className="text-sm lg:text-xs font-semibold text-blue-700 truncate">
              {globalSucursal === 'Todas' ? 'Sin sucursal' : globalSucursal}
            </span>
          </div>

          {/* Área badge */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 bg-purple-50 border border-purple-200 rounded-lg min-w-0">
            <Layers className="w-[18px] h-[18px] lg:w-[13px] lg:h-[13px] text-purple-600 shrink-0" />
            <span className="text-xs font-semibold text-purple-700 truncate hidden lg:block">
              {globalArea === 'Todas' ? 'Sin área' : globalArea}
            </span>
          </div>

          {/* Change button */}
          <button
            onClick={onChangeBranch}
            className="flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted border border-border transition-all duration-150"
            title="Cambiar sucursal y área"
          >
            <RefreshCw className="w-[18px] h-[18px] lg:w-3 lg:h-3" />
            <span className="hidden lg:block">Cambiar</span>
          </button>

          {/* Access level badge */}
          {role === 'lector' && (
            <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <Eye className="w-[18px] h-[18px] lg:w-[13px] lg:h-[13px] text-amber-600 shrink-0" />
              <span className="text-xs font-semibold text-amber-700 hidden lg:block">
                Solo lectura
              </span>
            </div>
          )}
          {role === 'admin' && (
            <div className="flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <Lock className="w-[18px] h-[18px] lg:w-[13px] lg:h-[13px] text-green-600 shrink-0" />
              <span className="text-xs font-semibold text-green-700 hidden lg:block">Admin</span>
            </div>
          )}

          {/* Install app (Android / PC con Chrome o Edge; en iPhone abre los pasos) */}
          {canInstall && (
            <button
              onClick={installApp ?? (() => setShowIosInstall(true))}
              className="ml-auto flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 rounded-lg text-xs font-semibold text-white bg-secondary hover:bg-blue-700 transition-all duration-150"
              title="Instalar DyL Gestor como app"
            >
              <Download className="w-[18px] h-[18px] lg:w-3 lg:h-3" />
              <span className="hidden lg:block">Instalar app</span>
            </button>
          )}

          {/* Logout button */}
          <button
            onClick={signOut}
            className={`${canInstall ? '' : 'ml-auto '}flex items-center gap-1.5 px-2.5 lg:px-3 py-2 lg:py-1.5 rounded-lg text-xs font-semibold text-muted-foreground hover:text-red-600 hover:bg-red-50 border border-border transition-all duration-150`}
            title={user?.email ? `Cerrar sesión (${user.email})` : 'Cerrar sesión'}
          >
            <LogOut className="w-[18px] h-[18px] lg:w-3 lg:h-3" />
            <span className="hidden lg:block">Salir</span>
          </button>
        </div>
      )}
      {showIosInstall && <IosInstallModal onClose={() => setShowIosInstall(false)} />}
    </header>
  );
}

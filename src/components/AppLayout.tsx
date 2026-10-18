'use client';
import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileNav from './MobileNav';
import BranchSelectorModal from './BranchSelectorModal';
import { useAppContext } from '@/context/AppContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const {
    loading,
    globalSucursal,
    globalArea,
    setGlobalSucursal,
    setGlobalArea,
    sucursales,
    areas,
  } = useAppContext();

  // Show selector modal if no branch/area selected yet (after data loads)
  const [showSelector, setShowSelector] = useState(false);

  // En el celular, el menú lateral se cierra al cambiar de página
  const pathname = usePathname();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!loading && (globalSucursal === 'Todas' || globalArea === 'Todas')) {
      setShowSelector(true);
    }
  }, [loading, globalSucursal, globalArea]);

  const handleConfirm = (sucursal: string, area: string) => {
    setGlobalSucursal(sucursal);
    setGlobalArea(area);
    setShowSelector(false);
  };

  return (
    <div
      className="flex overflow-hidden bg-background"
      style={{ height: 'var(--app-height, 100dvh)' }}
    >
      {/* Branch selector modal — shown until user picks sucursal + área */}
      {showSelector && !loading && <BranchSelectorModal onConfirm={handleConfirm} />}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <div className="hidden lg:flex shrink-0 h-full">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      </div>

      {/* Sidebar — mobile drawer */}
      <div
        className={`fixed top-0 left-0 h-full z-50 lg:hidden transition-transform duration-300 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar collapsed={false} onToggle={() => setMobileOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Topbar
          onMenuToggle={() => setMobileOpen(!mobileOpen)}
          onChangeBranch={() => setShowSelector(true)}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-[3px] border-secondary/20 border-t-secondary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Cargando datos...</p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
        <MobileNav onOpenMenu={() => setMobileOpen(true)} />
        <footer
          className="hidden lg:block text-center py-3 text-xs text-muted-foreground/60 border-t border-border bg-card"
          style={{ letterSpacing: '0.03em' }}
        >
          © 2026 VCG – Todos los derechos reservados.
        </footer>
      </div>
    </div>
  );
}

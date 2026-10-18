'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AppLogo from '@/components/ui/AppLogo';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Eye,
  CalendarCheck,
  UserCog,
  ShieldCheck,
} from 'lucide-react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/context/AuthContext';

const navItems: {
  label: string;
  icon: React.ElementType;
  href: string;
  adminOnly?: boolean;
  globalAdminOnly?: boolean;
}[] = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/' },
  { label: 'Malla', icon: CalendarDays, href: '/malla-de-turnos' },
  { label: 'Cumplimiento', icon: ShieldCheck, href: '/cumplimiento' },
  { label: 'Personal', icon: Users, href: '/personal' },
  { label: 'Asistencia', icon: CalendarCheck, href: '/asistencia' },
  { label: 'RRHH', icon: UserCog, href: '/rrhh', adminOnly: true },
  { label: 'Vista previa', icon: Eye, href: '/vista-previa' },
  { label: 'Ajustes', icon: Settings, href: '/ajustes', globalAdminOnly: true },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { isAdmin, isGlobalAdmin } = useAuth();
  const visibleItems = navItems.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.globalAdminOnly || isGlobalAdmin)
  );

  return (
    <aside
      className="flex flex-col h-full transition-all duration-300 ease-in-out"
      style={{
        width: collapsed ? 64 : 240,
        minHeight: '100%',
        background: 'linear-gradient(180deg, #0a1e3d 0%, #0f2744 40%, #112d52 100%)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.07]">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{
            background:
              'linear-gradient(135deg, rgba(29,91,212,0.6) 0%, rgba(96,165,250,0.3) 100%)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <AppLogo size={32} variant="mayorista" />
        </div>
        {!collapsed && (
          <div>
            <span className="font-extrabold text-sm tracking-widest text-white whitespace-nowrap uppercase">
              D&L Gestor
            </span>
            <p className="text-[10px] text-white/40 tracking-wider mt-0.5">Gestión de turnos</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-5 px-2.5 flex flex-col gap-0.5">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          return (
            <Link
              key={`nav-${item.href}`}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150 group relative ${
                isActive ? 'sidebar-nav-active' : 'sidebar-nav-hover text-white/55 hover:text-white'
              }`}
            >
              <Icon size={18} className={`shrink-0 ${isActive ? 'text-blue-300' : ''}`} />
              {!collapsed && (
                <span
                  className={`text-sm whitespace-nowrap ${isActive ? 'font-semibold text-white' : 'font-medium'}`}
                >
                  {item.label}
                </span>
              )}
              {collapsed && (
                <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-gray-900/95 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity duration-150 shadow-lg border border-white/10">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2.5 pb-5 flex flex-col gap-3 border-t border-white/[0.07] pt-4">
        {!collapsed && (
          <div className="flex items-center justify-center py-1">
            <span className="text-white/25 text-[10px] tracking-widest uppercase text-center">
              © 2026 VCG — Todos los derechos reservados
            </span>
          </div>
        )}
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-8 h-8 rounded-xl bg-white/[0.07] hover:bg-white/[0.13] text-white/60 hover:text-white transition-all duration-150 mx-auto border border-white/[0.08]"
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>
    </aside>
  );
}

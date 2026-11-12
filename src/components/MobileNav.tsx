'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CalendarCheck, Users, Inbox, Menu } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { routePerm } from '@/lib/permisos';
import { usePendingRequests } from '@/hooks/usePendingRequests';

// Menú inferior para celulares: accesos directos a los módulos más usados y
// un botón "Más" que abre el menú lateral con el resto.
const tabs = [
  { label: 'Malla', icon: CalendarDays, href: '/malla-de-turnos' },
  { label: 'Asistencia', icon: CalendarCheck, href: '/asistencia' },
  { label: 'Personal', icon: Users, href: '/personal' },
  { label: 'Solicitudes', icon: Inbox, href: '/solicitudes' },
];

interface MobileNavProps {
  onOpenMenu: () => void;
}

export default function MobileNav({ onOpenMenu }: MobileNavProps) {
  const pathname = usePathname();
  // Solo las secciones a las que tiene permiso
  const { can } = useAuth();
  const visibleTabs = tabs.filter((t) => {
    const perm = routePerm(t.href);
    return !perm || can(perm);
  });
  const pendingRequests = usePendingRequests();
  // El número de solicitudes por responder va en su pestaña; si no la ve, queda en "Más"
  const requestsTab = visibleTabs.some((t) => t.href === '/solicitudes');
  const moreBadge = requestsTab ? 0 : pendingRequests;
  const itemClass = 'flex flex-col items-center justify-center gap-0.5 min-h-[52px] text-xs';

  return (
    <nav
      aria-label="Menú principal"
      className={`lg:hidden grid ${['grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5'][visibleTabs.length]} bg-card border-t border-border shrink-0`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {visibleTabs.map(({ label, icon: TabIcon, href }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`${itemClass} relative ${active ? 'text-blue-700 font-semibold' : 'text-gray-500 font-medium'}`}
          >
            {href === '/solicitudes' && pendingRequests > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {pendingRequests}
              </span>
            )}
            <TabIcon size={22} strokeWidth={active ? 2.4 : 2} />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className={`${itemClass} relative text-gray-500 font-medium`}
        aria-label={moreBadge > 0 ? `Más (${moreBadge} solicitudes por responder)` : undefined}
      >
        {moreBadge > 0 && (
          <span className="absolute top-1.5 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {moreBadge}
          </span>
        )}
        <Menu size={22} />
        Más
      </button>
    </nav>
  );
}

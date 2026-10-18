'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, CalendarCheck, Users, Menu } from 'lucide-react';

// Menú inferior para celulares: accesos directos a los módulos más usados y
// un botón "Más" que abre el menú lateral con el resto.
const tabs = [
  { label: 'Malla', icon: CalendarDays, href: '/malla-de-turnos' },
  { label: 'Asistencia', icon: CalendarCheck, href: '/asistencia' },
  { label: 'Personal', icon: Users, href: '/personal' },
];

interface MobileNavProps {
  onOpenMenu: () => void;
}

export default function MobileNav({ onOpenMenu }: MobileNavProps) {
  const pathname = usePathname();
  const itemClass = 'flex flex-col items-center justify-center gap-0.5 min-h-[52px] text-xs';

  return (
    <nav
      aria-label="Menú principal"
      className="lg:hidden grid grid-cols-4 bg-card border-t border-border shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ label, icon: TabIcon, href }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`${itemClass} ${active ? 'text-blue-700 font-semibold' : 'text-gray-500 font-medium'}`}
          >
            <TabIcon size={22} strokeWidth={active ? 2.4 : 2} />
            {label}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        className={`${itemClass} text-gray-500 font-medium`}
      >
        <Menu size={22} />
        Más
      </button>
    </nav>
  );
}

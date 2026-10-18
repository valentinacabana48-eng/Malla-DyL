'use client';
import React from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import AuthGate from '@/components/AuthGate';

/**
 * Login de las admins y carga de datos de la app. "Mis turnos" (la página de las
 * trabajadoras) queda fuera: no pide cuenta ni carga la malla completa ni abre
 * conexiones en vivo.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith('/mis-turnos')) return <>{children}</>;
  return (
    <AuthProvider>
      <AuthGate>
        <AppProvider>{children}</AppProvider>
      </AuthGate>
    </AuthProvider>
  );
}

'use client';
import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

/**
 * Renderiza el contenido solo para administradores (la base de datos también lo impone).
 * Con `global`, solo para el administrador general (sin sucursales asignadas).
 */
export default function AdminOnly({
  children,
  global = false,
}: {
  children: React.ReactNode;
  global?: boolean;
}) {
  const { isAdmin, isGlobalAdmin } = useAuth();
  if (global ? isGlobalAdmin : isAdmin) return <>{children}</>;
  if (global && isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-3 text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <ShieldAlert size={22} className="text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Solo administración general</h2>
          <p className="text-sm text-muted-foreground">
            Esta sección cambia la configuración de todas las sucursales. Pide a la administradora
            general que haga el cambio.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <ShieldAlert size={22} className="text-amber-600" />
        </div>
        <h2 className="text-lg font-bold text-foreground">Solo administradores</h2>
        <p className="text-sm text-muted-foreground">
          Tu cuenta tiene acceso de solo lectura. Pide a un administrador que cambie tu rol si
          necesitas entrar a esta sección.
        </p>
      </div>
    </div>
  );
}

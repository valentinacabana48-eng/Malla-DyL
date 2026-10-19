'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { permsFor, type Perm, type UserRole } from '@/lib/permisos';

export type { UserRole } from '@/lib/permisos';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  /** Admin sin sucursales asignadas: puede usar Ajustes y administrar usuarios */
  isGlobalAdmin: boolean;
  /** No puede editar la malla */
  isReadonly: boolean;
  /** Tiene este permiso (dentro de su alcance) */
  can: (perm: Perm) => boolean;
  /** Edita la malla de la sucursal completa (sin áreas ni cargos limitados): bloqueos y turnos propios */
  canManageSucursal: boolean;
  /** Puede marcar asistencia (directo o por aprobar) */
  canMarkAttendance: boolean;
  /** Marca asistencia, pero no la aprueba: lo que marca queda por aprobar */
  isAsistencia: boolean;
  /** Áreas que ve; null = todas */
  allowedAreas: string[] | null;
  /** Cargos que ve; null = todos */
  allowedCargos: string[] | null;
  /** Sucursales que puede ver esta persona; null = todas */
  allowedSucursales: string[] | null;
  /** true cuando el usuario llegó desde el enlace de "olvidé mi contraseña" */
  recoveringPassword: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Traduce los mensajes de error más comunes de Supabase Auth
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (m.includes('email not confirmed'))
    return 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.';
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese correo.';
  if (m.includes('password should be at least'))
    return 'La contraseña debe tener al menos 8 caracteres.';
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Demasiados intentos. Espera unos minutos e intenta de nuevo.';
  if (m.includes('signups not allowed'))
    return 'El registro de cuentas nuevas está deshabilitado. Pide a un administrador que te cree una cuenta.';
  return message;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [allowedSucursales, setAllowedSucursales] = useState<string[] | null>(null);
  const [allowedCargos, setAllowedCargos] = useState<string[] | null>(null);
  const [allowedAreas, setAllowedAreas] = useState<string[] | null>(null);
  const [permisos, setPermisos] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveringPassword, setRecoveringPassword] = useState(false);

  const loadRole = useCallback(
    async (userId: string | undefined) => {
      if (!userId) {
        setRole(null);
        setAllowedSucursales(null);
        setAllowedCargos(null);
        setAllowedAreas(null);
        setPermisos(null);
        return;
      }
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        // Un corte de red momentáneo no debe sacar al usuario: se conserva el rol que ya tenía
        console.error('Error loading role:', error);
        setRole((prev) => prev ?? 'pendiente');
        return;
      }
      // Si la lista no cambió se conserva la misma, para no recargar la app en cada lectura
      const keep = (next: string[] | null) => (prev: string[] | null) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      const listOrNull = (v: unknown) => {
        const list = (v as string[] | null) ?? null;
        return list && list.length > 0 ? list : null;
      };
      setAllowedSucursales(keep(listOrNull(data?.sucursales)));
      setAllowedCargos(keep(listOrNull(data?.cargos)));
      setAllowedAreas(keep(listOrNull(data?.areas)));
      setPermisos(keep((data?.permisos as string[] | null) ?? null));
      setRole((data?.role as UserRole) ?? 'pendiente');
    },
    [supabase]
  );

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadRole(data.session?.user.id);
      if (active) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true);
      setSession(newSession);
      // No llamar a Supabase dentro del callback (puede bloquear el cliente); se difiere.
      setTimeout(() => {
        loadRole(newSession?.user.id);
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadRole]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return error ? translateAuthError(error.message) : null;
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      return error ? translateAuthError(error.message) : null;
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setRole(null);
  }, [supabase]);

  const sendPasswordReset = useCallback(
    async (email: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      return error ? translateAuthError(error.message) : null;
    },
    [supabase]
  );

  const updatePassword = useCallback(
    async (password: string) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return translateAuthError(error.message);
      setRecoveringPassword(false);
      return null;
    },
    [supabase]
  );

  const refreshRole = useCallback(async () => {
    await loadRole(session?.user.id);
  }, [loadRole, session]);

  // Los permisos se vuelven a leer al volver a la app y cada minuto, para que un cambio
  // hecho en Ajustes se aplique sin tener que cerrar sesión.
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    const reload = () => {
      if (document.visibilityState === 'visible') loadRole(userId);
    };
    const timer = window.setInterval(reload, 60_000);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [userId, loadRole]);

  const perms = useMemo(() => permsFor(role, permisos), [role, permisos]);
  const can = useCallback((perm: Perm) => perms.has(perm), [perms]);
  const fullScope = allowedSucursales === null && allowedAreas === null && allowedCargos === null;

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        role,
        loading,
        isAdmin: role === 'admin',
        isGlobalAdmin: role === 'admin' && fullScope,
        allowedSucursales,
        isReadonly: !perms.has('malla_editar'),
        can,
        canManageSucursal:
          perms.has('malla_editar') && allowedAreas === null && allowedCargos === null,
        canMarkAttendance: perms.has('asistencia_marcar') || perms.has('asistencia_aprobar'),
        isAsistencia: perms.has('asistencia_marcar') && !perms.has('asistencia_aprobar'),
        allowedAreas,
        allowedCargos,
        recoveringPassword,
        signIn,
        signUp,
        signOut,
        sendPasswordReset,
        updatePassword,
        refreshRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

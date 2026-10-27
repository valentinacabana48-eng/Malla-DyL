'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

/** Cuántas solicitudes de Mis turnos esperan respuesta (se revisa cada minuto). */
export function usePendingRequests(): number {
  const { can } = useAuth();
  const enabled = can('solicitudes');
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    const supabase = getSupabase();
    let active = true;
    const load = async () => {
      if (document.visibilityState !== 'visible') return;
      const { count: n, error } = await supabase
        .from('shift_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pendiente');
      // Si la tabla aún no existe (falta el SQL) no se muestra nada
      if (active) setCount(error ? 0 : (n ?? 0));
    };
    load();
    const timer = window.setInterval(load, 60_000);
    const onChange = () => load();
    window.addEventListener('focus', onChange);
    window.addEventListener('solicitudes-cambiaron', onChange);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onChange);
      window.removeEventListener('solicitudes-cambiaron', onChange);
    };
  }, [enabled]);

  return count;
}

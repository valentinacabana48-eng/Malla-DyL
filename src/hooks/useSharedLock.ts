'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Bloqueo compartido guardado en app_settings: se ve igual en todos los
 * dispositivos y solo un admin puede cambiarlo (RLS).
 * Con `key = null` no hay bloqueo (por ejemplo, si no hay una sucursal elegida).
 */
export function useSharedLock(key: string | null) {
  const supabase = getSupabase();
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    setIsLocked(false);
    if (!key) return;
    let active = true;
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsLocked(data?.value === 'true');
      });

    const channel = supabase
      .channel(`lock-${key}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_settings' },
        (payload) => {
          // Se filtra aquí: la clave lleva el nombre de la sucursal (espacios, tildes)
          const row = payload.new as { key?: string; value?: string } | null;
          if (row?.key === key) setIsLocked(row.value === 'true');
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, key]);

  const setLocked = useCallback(
    async (locked: boolean): Promise<boolean> => {
      if (!key) return false;
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key, value: String(locked), updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
      if (error) {
        toast.error('No se pudo cambiar el bloqueo.');
        return false;
      }
      setIsLocked(locked);
      return true;
    },
    [supabase, key]
  );

  return { isLocked, setLocked };
}

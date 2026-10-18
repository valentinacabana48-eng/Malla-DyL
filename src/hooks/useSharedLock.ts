'use client';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';

/**
 * Bloqueo compartido guardado en app_settings: se ve igual en todos los
 * dispositivos y solo un admin puede cambiarlo (RLS).
 */
export function useSharedLock(key: string) {
  const supabase = getSupabase();
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
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
        { event: '*', schema: 'public', table: 'app_settings', filter: `key=eq.${key}` },
        (payload) => {
          const row = payload.new as { value?: string } | null;
          setIsLocked(row?.value === 'true');
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, key]);

  const setLocked = useCallback(async (locked: boolean): Promise<boolean> => {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value: String(locked), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) {
      toast.error('No se pudo cambiar el bloqueo.');
      return false;
    }
    setIsLocked(locked);
    return true;
  }, [supabase, key]);

  return { isLocked, setLocked };
}

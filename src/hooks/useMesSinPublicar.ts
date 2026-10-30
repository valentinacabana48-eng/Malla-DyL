'use client';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';

/** Mes actual en Chile, "YYYY-MM" */
function mesActualChile(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}`;
}

/**
 * Quien no tiene «Malla: Publicar» solo ve un mes que viene cuando ya está publicado como
 * definitivo para la sucursal (la base de datos no le entrega lo demás). Devuelve null si
 * esta cuenta ve el mes completo, o las sucursales donde ya es definitivo (vacío mientras
 * se lee).
 */
export function useMesSinPublicar(monthKey: string): Set<string> | null {
  const { can } = useAuth();
  const restringido = !can('malla_publicar') && monthKey > mesActualChile();
  const [publicadas, setPublicadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!restringido) return;
    let active = true;
    setPublicadas(new Set());
    getSupabase()
      .from('published_schedules')
      .select('sucursal')
      .eq('month_key', monthKey)
      .eq('definitiva', true)
      .then(({ data }) => {
        if (active) setPublicadas(new Set((data || []).map((r) => r.sucursal as string)));
      });
    return () => {
      active = false;
    };
  }, [restringido, monthKey]);

  return restringido ? publicadas : null;
}

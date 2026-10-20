'use client';
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase/client';
import { useAppContext, type Shift, type ShiftCode } from '@/context/AppContext';

/** Marca de una casilla de la malla que cambió por una solicitud aprobada */
export interface RequestMark {
  /** "Cambió con Catherine", "Día libre pedido", "Cambio de turno pedido" */
  text: string;
  /** Lo que tenía antes, ya escrito: "15:00 a 21:00" o "libre" */
  antes: string;
  /** Quién aprobó y cuándo: "talca@… · 20 oct" */
  aprobado: string;
}

interface Row {
  worker_id: string;
  companera_id: string | null;
  tipo: 'libre' | 'cambio' | 'intercambio';
  fecha: string;
  turno_actual: string;
  turno_pedido: string;
  turno_companera?: string;
  turno_companera_antes?: string;
  resolved_by_email: string;
  resolved_at: string | null;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

function shiftText(code: string, shifts: Record<string, Shift>): string {
  if (!code || code === 'DESC') return 'libre';
  const s = shifts[code];
  return s?.start ? `${s.start} a ${s.end}` : code;
}

/**
 * Solicitudes aprobadas del mes, por casilla ("workerId-díaÍndice").
 * Solo marca la casilla si todavía tiene el turno que quedó al aprobar
 * (si después la editaron a mano, la marca ya no corresponde).
 */
export function useRequestMarks(
  monthKey: string,
  scheduleData: Record<string, ShiftCode[]>,
  specialDaysData: Record<string, Record<number, string>>
): Record<string, RequestMark> {
  const { workers, shifts } = useAppContext();
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let active = true;
    const [y, m] = monthKey.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const load = async () => {
      const { data, error } = await getSupabase()
        .from('shift_requests')
        .select(
          'worker_id, companera_id, tipo, fecha, turno_actual, turno_pedido, turno_companera, turno_companera_antes, resolved_by_email, resolved_at'
        )
        .eq('status', 'aprobada')
        .gte('fecha', `${monthKey}-01`)
        .lte('fecha', `${monthKey}-${String(last).padStart(2, '0')}`)
        .order('resolved_at');
      // Sin la tabla (falta el SQL) no se marca nada
      if (active) setRows(error ? [] : ((data as Row[]) ?? []));
    };
    load();
    window.addEventListener('solicitudes-cambiaron', load);
    return () => {
      active = false;
      window.removeEventListener('solicitudes-cambiaron', load);
    };
  }, [monthKey]);

  return useMemo(() => {
    const nameOf = (id: string | null) =>
      workers
        .find((w) => w.id === id)
        ?.name.split(' ')
        .slice(0, 2)
        .join(' ') ?? 'una compañera';
    const out: Record<string, RequestMark> = {};
    const put = (wid: string, day: number, final: string, mark: RequestMark) => {
      if (specialDaysData[wid]?.[day]) return;
      const now = scheduleData[wid]?.[day] ?? '';
      if ((now || 'DESC') !== (final || 'DESC')) return;
      out[`${wid}-${day}`] = mark;
    };
    rows.forEach((r) => {
      const day = Number(r.fecha.slice(8, 10)) - 1;
      const at = r.resolved_at ? new Date(r.resolved_at) : null;
      const aprobado = [r.resolved_by_email, at ? `${at.getDate()} ${MESES[at.getMonth()]}` : '']
        .filter(Boolean)
        .join(' · ');
      if (r.tipo === 'intercambio') {
        // turno_pedido es lo que quedó para quien pidió; turno_actual era su turno de antes
        const compFinal = r.turno_companera || r.turno_actual;
        put(r.worker_id, day, r.turno_pedido, {
          text: `Cambió con ${nameOf(r.companera_id)}`,
          antes: shiftText(r.turno_actual, shifts),
          aprobado,
        });
        if (r.companera_id)
          put(r.companera_id, day, compFinal, {
            text: `Cambió con ${nameOf(r.worker_id)}`,
            antes: shiftText(r.turno_companera_antes ?? '', shifts),
            aprobado,
          });
      } else {
        put(r.worker_id, day, r.turno_pedido, {
          text: r.tipo === 'libre' ? 'Día libre pedido' : 'Cambio de turno pedido',
          antes: shiftText(r.turno_actual, shifts),
          aprobado,
        });
      }
    });
    return out;
  }, [rows, workers, shifts, scheduleData, specialDaysData]);
}

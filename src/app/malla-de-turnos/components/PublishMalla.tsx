'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Send, X, CheckCircle2, AlertTriangle, KeyRound } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { useAppContext, getDaysInMonth, monthLabelToKey } from '@/context/AppContext';
import {
  changedDays,
  dayText,
  effectiveMonthDays,
  misTurnosUrl,
  whatsappLink,
  type PublishedMonth,
} from '@/lib/misTurnos';

export interface PendingChange {
  workerId: string;
  name: string;
  kind: 'nueva' | 'cambio' | 'sale';
  days: number[];
}

/**
 * Estado de la publicación de una sucursal y mes: cuándo se publicó, la copia publicada y
 * los cambios hechos después. Se lee al abrir la Malla y al publicar (sin conexión en vivo).
 */
export function usePublishState(monthLabel: string, sucursal: string | null) {
  const { workers, scheduleData, specialDays, shifts } = useAppContext();
  const monthKey = monthLabelToKey(monthLabel);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, PublishedMonth>>({});
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!sucursal) {
      setPublishedAt(null);
      setSnapshots({});
      setLoaded(false);
      return;
    }
    const supabase = getSupabase();
    try {
      const [{ data: pub, error }, rows] = await Promise.all([
        supabase
          .from('published_schedules')
          .select('published_at')
          .eq('month_key', monthKey)
          .eq('sucursal', sucursal)
          .maybeSingle(),
        fetchAll((from, to) =>
          supabase
            .from('published_schedule_days')
            .select('worker_id, days')
            .eq('month_key', monthKey)
            .eq('sucursal', sucursal)
            .order('worker_id')
            .range(from, to)
        ),
      ]);
      if (error) throw error;
      setPublishedAt((pub?.published_at as string | undefined) ?? null);
      const snap: Record<string, PublishedMonth> = {};
      rows.forEach((r) => {
        snap[r.worker_id as string] = (r.days as PublishedMonth) || [];
      });
      setSnapshots(snap);
      setLoaded(true);
    } catch (err) {
      console.error('Error al leer la malla publicada:', err);
      setLoaded(false);
    }
  }, [monthKey, sucursal]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sucursalWorkers = useMemo(
    () => workers.filter((w) => w.sucursal === sucursal && w.estado === 'Activo'),
    [workers, sucursal]
  );

  const current = useMemo(() => {
    const n = getDaysInMonth(monthLabel);
    const out: Record<string, PublishedMonth> = {};
    sucursalWorkers.forEach((w) => {
      out[w.id] = effectiveMonthDays(
        scheduleData[monthKey]?.[w.id],
        specialDays[monthKey]?.[w.id],
        shifts,
        n
      );
    });
    return out;
  }, [sucursalWorkers, scheduleData, specialDays, shifts, monthKey, monthLabel]);

  const pending = useMemo<PendingChange[]>(() => {
    if (!loaded || !publishedAt) return [];
    const list: PendingChange[] = [];
    sucursalWorkers.forEach((w) => {
      const snap = snapshots[w.id];
      if (!snap) {
        list.push({ workerId: w.id, name: w.name, kind: 'nueva', days: [] });
        return;
      }
      const days = changedDays(current[w.id], snap);
      if (days.length > 0) list.push({ workerId: w.id, name: w.name, kind: 'cambio', days });
    });
    const activeIds = new Set(sucursalWorkers.map((w) => w.id));
    Object.keys(snapshots).forEach((id) => {
      if (!activeIds.has(id)) {
        const name = workers.find((w) => w.id === id)?.name ?? 'Trabajadora';
        list.push({ workerId: id, name, kind: 'sale', days: [] });
      }
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [loaded, publishedAt, sucursalWorkers, snapshots, current, workers]);

  return {
    monthKey,
    sucursal,
    loaded,
    publishedAt,
    snapshots,
    current,
    pending,
    sucursalWorkers,
    refresh,
  };
}

export type PublishState = ReturnType<typeof usePublishState>;

function formatFecha(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function listDays(days: number[]): string {
  const nums = days.map((d) => String(d + 1));
  if (nums.length === 1) return `día ${nums[0]}`;
  return `días ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`;
}

interface PublishResult {
  firstTime: boolean;
  changedNames: string[];
}

export function PublishModal({
  state,
  monthLabel,
  onClose,
}: {
  state: PublishState;
  monthLabel: string;
  onClose: () => void;
}) {
  const { getAllNonWorkingTypes } = useAppContext();
  const { sucursal, monthKey, publishedAt, pending, snapshots, current, sucursalWorkers } = state;
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [withoutPin, setWithoutPin] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const extraTypes = getAllNonWorkingTypes();

  // Quiénes todavía no tienen clave para entrar a Mis turnos
  useEffect(() => {
    const ids = sucursalWorkers.map((w) => w.id);
    if (ids.length === 0) {
      setWithoutPin([]);
      return;
    }
    getSupabase()
      .rpc('worker_pin_status', { p_worker_ids: ids })
      .then(({ data, error }) => {
        if (error) {
          console.error('Error al revisar las claves:', error);
          return;
        }
        const conClave = new Set(
          ((data as { r_worker_id: string }[]) || []).map((r) => r.r_worker_id)
        );
        setWithoutPin(sucursalWorkers.filter((w) => !conClave.has(w.id)).map((w) => w.name));
      });
  }, [sucursalWorkers]);

  const handlePublish = async () => {
    if (!sucursal) return;
    setPublishing(true);
    const firstTime = !publishedAt;
    const { data, error } = await getSupabase().rpc('publish_schedule', {
      p_month_key: monthKey,
      p_sucursal: sucursal,
    });
    setPublishing(false);
    if (error) {
      console.error('Error al publicar:', error);
      toast.error('No se pudo publicar la malla. Revisa tu conexión e intenta de nuevo.');
      return;
    }
    const rows = (data as { r_worker_id: string; r_changed: number; r_is_new: boolean }[]) || [];
    const changedIds = new Set(rows.filter((r) => r.r_changed > 0).map((r) => r.r_worker_id));
    const changedNames = sucursalWorkers.filter((w) => changedIds.has(w.id)).map((w) => w.name);
    setResult({ firstTime, changedNames });
    toast.success(`Malla de ${sucursal} publicada`);
    await state.refresh();
  };

  const whatsappText = result
    ? result.firstTime || result.changedNames.length === 0
      ? `Hola equipo, ya está publicada la malla de ${monthLabel} de ${sucursal}. Revísala en ${misTurnosUrl()} con tu RUT y tu clave.`
      : `Hola, se actualizó la malla de ${monthLabel} de ${sucursal}. Cambió la de: ${result.changedNames.join(', ')}. Revísala en ${misTurnosUrl()}.`
    : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        className="bg-card w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border">
          <div>
            <h2 id="publish-title" className="text-base font-bold text-foreground">
              Publicar malla para Mis turnos
            </h2>
            <p className="text-sm text-muted-foreground">
              {sucursal} · {monthLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 -mr-2 -mt-1 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 text-sm">
          {result ? (
            <>
              <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 rounded-xl px-3 py-2.5">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                <span>
                  Listo, la malla quedó publicada.
                  {!result.firstTime &&
                    (result.changedNames.length === 0
                      ? ' Nadie tuvo cambios de turno.'
                      : ` ${result.changedNames.length} trabajadora(s) verán el aviso de que su malla cambió.`)}
                </span>
              </div>
              <a
                href={whatsappLink(whatsappText)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700"
              >
                <Send size={16} />
                Avisar por WhatsApp
              </a>
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                «{whatsappText}»
              </p>
            </>
          ) : (
            <>
              {!state.loaded ? (
                <p className="text-muted-foreground">Revisando lo publicado…</p>
              ) : !publishedAt ? (
                <p className="text-foreground">
                  Esta malla todavía no está publicada. Al publicarla, las {sucursalWorkers.length}{' '}
                  trabajadoras activas de {sucursal} podrán verla en Mis turnos.
                </p>
              ) : pending.length === 0 ? (
                <div className="flex items-start gap-2 text-green-800">
                  <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
                  <span>Publicada el {formatFecha(publishedAt)}. No hay cambios sin publicar.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2 text-amber-800">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <span>
                      Publicada el {formatFecha(publishedAt)}. Hay cambios sin publicar para{' '}
                      {pending.length} trabajadora(s):
                    </span>
                  </div>
                  <ul className="border border-border rounded-xl divide-y divide-border max-h-72 overflow-y-auto">
                    {pending.map((p) => (
                      <li key={p.workerId}>
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === p.workerId ? null : p.workerId)}
                          disabled={p.kind !== 'cambio'}
                          aria-expanded={expanded === p.workerId}
                          className="w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 min-h-[44px]"
                        >
                          <span className="font-semibold text-foreground">{p.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {p.kind === 'nueva'
                              ? 'Nueva en la malla'
                              : p.kind === 'sale'
                                ? 'Ya no está en la sucursal'
                                : listDays(p.days)}
                          </span>
                        </button>
                        {expanded === p.workerId && p.kind === 'cambio' && (
                          <ul className="px-3 pb-2.5 flex flex-col gap-1 text-xs">
                            {p.days.map((d) => (
                              <li key={d} className="text-muted-foreground">
                                <span className="font-semibold text-foreground">Día {d + 1}:</span>{' '}
                                {dayText(snapshots[p.workerId]?.[d], extraTypes)} →{' '}
                                <span className="font-semibold text-foreground">
                                  {dayText(current[p.workerId]?.[d], extraTypes)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {withoutPin && withoutPin.length > 0 && (
                <div className="flex items-start gap-2 text-muted-foreground bg-muted/40 rounded-xl px-3 py-2.5">
                  <KeyRound size={16} className="shrink-0 mt-0.5" />
                  <span>
                    {withoutPin.length === sucursalWorkers.length
                      ? 'Ninguna trabajadora tiene clave todavía.'
                      : `${withoutPin.length} trabajadora(s) todavía no tienen clave: ${withoutPin.slice(0, 8).join(', ')}${withoutPin.length > 8 ? '…' : ''}.`}{' '}
                    Se asigna en Personal, al editar a la trabajadora.
                  </span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Las trabajadoras ven el mes actual, el siguiente desde 7 días antes de que empiece y
                el anterior hasta 7 días después de que termine.
              </p>

              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || !state.loaded}
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-secondary text-white font-bold hover:bg-blue-700 disabled:opacity-50"
              >
                <Send size={16} />
                {publishing
                  ? 'Publicando…'
                  : !publishedAt
                    ? 'Publicar'
                    : pending.length > 0
                      ? 'Publicar cambios'
                      : 'Publicar de nuevo'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

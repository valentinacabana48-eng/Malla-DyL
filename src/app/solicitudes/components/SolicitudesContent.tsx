'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Inbox, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useAppContext } from '@/context/AppContext';

// Solicitudes que las trabajadoras hacen desde Mis turnos: día libre o cambio de turno.
// Al aprobar, la base de datos cambia la malla de ese día (queda por publicar).

interface Request {
  id: string;
  worker_id: string;
  tipo: 'libre' | 'cambio';
  fecha: string;
  turno_actual: string;
  turno_pedido: string;
  motivo: string;
  status: 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';
  respuesta: string;
  resolved_by_email: string;
  resolved_at: string | null;
  created_at: string;
}

const STATUS: Record<Request['status'], { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-900' },
  aprobada: { label: 'Aprobada', cls: 'bg-green-100 text-green-800' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada por ella', cls: 'bg-gray-100 text-gray-600' },
};

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaText(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DOW[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export default function SolicitudesContent() {
  const supabase = getSupabase();
  const { workers, shifts, getAllNonWorkingTypes } = useAppContext();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [tab, setTab] = useState<'pendientes' | 'respondidas'>('pendientes');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('shift_requests')
      .select('*')
      .or(`status.eq.pendiente,fecha.gte.${since}`)
      .order('fecha', { ascending: true })
      .limit(500);
    if (error) {
      setMissingTable(/shift_requests/.test(error.message));
      console.error('Solicitudes:', error);
    } else {
      setMissingTable(false);
      setRequests((data as Request[]) ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);
  const multiSucursal = new Set(workers.map((w) => w.sucursal)).size > 1;
  const nonWorking = getAllNonWorkingTypes();

  const shiftText = (code: string) => {
    if (!code) return 'Sin turno';
    if (code === 'DESC') return 'Libre';
    const s = shifts[code];
    if (s?.start) return `${s.start} a ${s.end}`;
    return nonWorking.find((t) => t.code === code)?.label ?? code;
  };

  const pending = requests.filter((r) => r.status === 'pendiente');
  const answered = requests
    .filter((r) => r.status !== 'pendiente')
    .sort((a, b) => (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at));
  const list = tab === 'pendientes' ? pending : answered;

  const resolve = async (r: Request, aprobar: boolean) => {
    setBusy(r.id);
    const { error } = await supabase.rpc('resolve_shift_request', {
      p_id: r.id,
      p_aprobar: aprobar,
      p_respuesta: notes[r.id] ?? '',
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || 'No se pudo responder la solicitud.');
      return;
    }
    toast.success(
      aprobar
        ? 'Aprobada. La malla quedó cambiada; recuerda publicarla para que ella la vea.'
        : 'Rechazada.'
    );
    window.dispatchEvent(new Event('solicitudes-cambiaron'));
    await load();
  };

  return (
    <div className="p-4 lg:p-6 xl:p-8 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
          <Inbox size={20} className="text-secondary" />
          Solicitudes
        </h1>
        <p className="text-muted-foreground text-sm mt-1 ml-3">
          Días libres y cambios de turno pedidos desde Mis turnos
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-xl mb-4 max-w-sm">
        {(
          [
            ['pendientes', `Pendientes (${pending.length})`],
            ['respondidas', 'Respondidas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`py-2 rounded-lg text-sm font-semibold ${
              tab === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {missingTable ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Falta preparar la base de datos para las solicitudes (el SQL de Supabase).
        </p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-card border border-border rounded-2xl px-4 py-8 text-center">
          {tab === 'pendientes' ? 'No hay solicitudes por responder.' : 'Aún no hay respondidas.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((r) => {
            const w = workerById.get(r.worker_id);
            return (
              <li
                key={r.id}
                className="bg-card border border-border rounded-2xl px-4 py-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {w?.name ?? 'Trabajadora'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[w?.cargo, multiSucursal ? w?.sucursal : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-bold rounded-full px-2.5 py-1 ${STATUS[r.status].cls}`}
                  >
                    {STATUS[r.status].label}
                  </span>
                </div>

                <div className="text-sm">
                  <span className="font-bold text-foreground">
                    {r.tipo === 'libre' ? 'Día libre' : 'Cambio de turno'} · {fechaText(r.fecha)}
                  </span>
                  <p className="text-muted-foreground">
                    Tenía: {shiftText(r.turno_actual)}
                    {r.tipo === 'cambio' && (
                      <>
                        {' '}
                        · Pide:{' '}
                        <span className="font-semibold text-foreground">
                          {shiftText(r.turno_pedido)}
                        </span>
                      </>
                    )}
                  </p>
                  {r.motivo && <p className="text-muted-foreground mt-0.5">«{r.motivo}»</p>}
                </div>

                {r.status === 'pendiente' ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Respuesta (opcional)"
                      maxLength={300}
                      className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => resolve(r, false)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-700 bg-red-50 text-sm font-semibold disabled:opacity-50"
                      >
                        <X size={15} />
                        Rechazar
                      </button>
                      <button
                        type="button"
                        disabled={busy === r.id}
                        onClick={() => resolve(r, true)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check size={15} />
                        Aprobar
                      </button>
                    </div>
                  </div>
                ) : (
                  (r.respuesta || r.resolved_by_email) && (
                    <p className="text-xs text-muted-foreground">
                      {r.respuesta && <>Respuesta: «{r.respuesta}» </>}
                      {r.resolved_by_email && <>· {r.resolved_by_email}</>}
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

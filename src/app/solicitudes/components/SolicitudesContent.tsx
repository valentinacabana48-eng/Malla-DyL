'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Inbox, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import {
  calcNetHours,
  shiftsForSucursales,
  timeToMinutes,
  useAppContext,
  type Worker,
} from '@/context/AppContext';

// Solicitudes que las trabajadoras hacen desde Mis turnos: día libre o cambio de turno.
// Al aprobar, la base de datos cambia la malla de ese día (queda por publicar).

interface Request {
  id: string;
  worker_id: string;
  tipo: 'libre' | 'cambio' | 'intercambio';
  companera_id: string | null;
  companera_status: '' | 'pendiente' | 'aceptada' | 'rechazada';
  fecha: string;
  turno_actual: string;
  turno_companera?: string;
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

const fmtHoras = (h: number) => (Math.round(h * 10) / 10).toString().replace('.', ',');

function fechaText(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DOW[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}

export default function SolicitudesContent() {
  const supabase = getSupabase();
  const { workers, shifts, scheduleData, specialDays, getAllNonWorkingTypes } = useAppContext();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [tab, setTab] = useState<'pendientes' | 'respondidas'>('pendientes');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Turno que queda a cada una al aprobar (se puede ajustar antes de aprobar)
  const [chosen, setChosen] = useState<Record<string, { turno?: string; comp?: string }>>({});

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

  // Turno de la malla ese día (o lo especial: vacaciones, permiso…)
  const codeOn = (wid: string, date: Date): string => {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const di = date.getDate() - 1;
    return specialDays[key]?.[wid]?.[di] ?? scheduleData[key]?.[wid]?.[di] ?? '';
  };

  // Horas de la semana (lunes a domingo) de esa fecha, con el turno que quedaría ese día
  const weekHours = (wid: string, iso: string, code: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const monday = new Date(y, m - 1, d - ((target.getDay() + 6) % 7));
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      const c = day.getTime() === target.getTime() ? code : codeOn(wid, day);
      const sh = shifts[c];
      if (sh?.start) total += calcNetHours(sh);
    }
    return total;
  };

  const shiftOptions = (w: Worker | undefined) =>
    Object.values(w ? shiftsForSucursales(shifts, [w.sucursal]) : shifts)
      .filter((sh) => sh.start)
      .sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));

  const defaults = (r: Request) => ({
    turno: chosen[r.id]?.turno ?? (r.tipo === 'libre' ? 'DESC' : r.turno_pedido),
    comp: chosen[r.id]?.comp ?? (r.turno_actual || 'DESC'),
  });

  const pending = requests.filter((r) => r.status === 'pendiente');
  const answered = requests
    .filter((r) => r.status !== 'pendiente')
    .sort((a, b) => (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at));
  const list = tab === 'pendientes' ? pending : answered;

  const resolve = async (r: Request, aprobar: boolean) => {
    setBusy(r.id);
    const pick = defaults(r);
    const { error } = await supabase.rpc('resolve_shift_request', {
      p_id: r.id,
      p_aprobar: aprobar,
      p_respuesta: notes[r.id] ?? '',
      p_turno: aprobar ? pick.turno : null,
      p_turno_companera: aprobar && r.tipo === 'intercambio' ? pick.comp : null,
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
            const comp = r.companera_id ? workerById.get(r.companera_id) : undefined;
            const pick = defaults(r);
            const waiting = r.tipo === 'intercambio' && r.companera_status !== 'aceptada';
            // Fila para elegir el turno que queda y ver cómo queda su semana
            const pickRow = (
              who: Worker | undefined,
              wid: string,
              value: string,
              before: string,
              onChange: (v: string) => void
            ) => {
              const now = weekHours(wid, r.fecha, value);
              const prev = weekHours(wid, r.fecha, before);
              const target = who?.horasContratadas ?? 0;
              const ok = target > 0 && Math.abs(now - target) < 0.01;
              return (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-semibold text-foreground sm:w-40 truncate">
                    {who?.name ?? 'Trabajadora'}
                  </span>
                  <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm sm:w-44"
                  >
                    <option value="DESC">Libre</option>
                    {shiftOptions(who).map((sh) => (
                      <option key={sh.code} value={sh.code}>
                        {sh.start} a {sh.end}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`text-xs font-semibold ${ok ? 'text-green-700' : 'text-amber-700'}`}
                  >
                    Semana: {fmtHoras(now)}
                    {target > 0 && ` de ${target}`} h {ok ? '✓' : ''}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      (antes {fmtHoras(prev)})
                    </span>
                  </span>
                </div>
              );
            };
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
                    {r.tipo === 'libre'
                      ? 'Día libre'
                      : r.tipo === 'cambio'
                        ? 'Cambio de turno'
                        : `Cambio con ${comp?.name ?? 'una compañera'}`}{' '}
                    · {fechaText(r.fecha)}
                  </span>
                  <p className="text-muted-foreground">
                    Tenía: {shiftText(r.turno_actual)}
                    {r.tipo === 'intercambio' && r.status !== 'aprobada' && (
                      <>
                        {' '}
                        · {comp?.name?.split(' ')[0] ?? 'Ella'} tenía: {shiftText(r.turno_pedido)}
                      </>
                    )}
                    {r.tipo === 'cambio' && r.status !== 'aprobada' && (
                      <>
                        {' '}
                        · Pide:{' '}
                        <span className="font-semibold text-foreground">
                          {shiftText(r.turno_pedido)}
                        </span>
                      </>
                    )}
                  </p>
                  {r.status === 'aprobada' && (
                    <p className="text-muted-foreground">
                      Quedó:{' '}
                      <span className="font-semibold text-foreground">
                        {shiftText(r.turno_pedido)}
                      </span>
                      {r.tipo === 'intercambio' && (
                        <>
                          {' '}
                          · {comp?.name?.split(' ')[0] ?? 'Ella'}:{' '}
                          <span className="font-semibold text-foreground">
                            {shiftText(r.turno_companera || r.turno_actual)}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                  {r.motivo && <p className="text-muted-foreground mt-0.5">«{r.motivo}»</p>}
                </div>

                {r.status === 'pendiente' && (
                  <div className="flex flex-col gap-2 border-t border-border pt-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Al aprobar queda
                    </span>
                    {pickRow(w, r.worker_id, pick.turno, r.turno_actual, (v) =>
                      setChosen((c) => ({ ...c, [r.id]: { ...c[r.id], turno: v } }))
                    )}
                    {r.tipo === 'intercambio' &&
                      r.companera_id &&
                      pickRow(comp, r.companera_id, pick.comp, r.turno_pedido, (v) =>
                        setChosen((c) => ({ ...c, [r.id]: { ...c[r.id], comp: v } }))
                      )}
                    {waiting && (
                      <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        Esperando que {comp?.name ?? 'la compañera'} acepte el cambio en su Mis
                        turnos.
                      </p>
                    )}
                  </div>
                )}

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
                        disabled={busy === r.id || waiting}
                        title={waiting ? 'Falta que la compañera acepte' : undefined}
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

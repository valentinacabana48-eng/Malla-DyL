'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Inbox, Printer, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import {
  calcNetHours,
  shiftsForSucursales,
  timeToMinutes,
  useAppContext,
  type TipoAusencia,
  type Worker,
} from '@/context/AppContext';
import { imprimirHoja, tipoLabel } from '@/app/malla-de-turnos/components/LicenciaModal';

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
  const {
    workers,
    shifts,
    scheduleData,
    specialDays,
    getAllNonWorkingTypes,
    licencias,
    registrarLicencia,
  } = useAppContext();
  // Sin la casilla "Responder" se ven las solicitudes, pero no se aprueban ni rechazan
  const canResponder = useAuth().can('solicitudes_responder');
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [tab, setTab] = useState<'pendientes' | 'respondidas'>('pendientes');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  // Turno que queda a cada una al aprobar (se puede ajustar antes de aprobar)
  // En un día libre con turno: cómo queda (descanso o permiso con/sin goce)
  const [chosen, setChosen] = useState<
    Record<string, { turno?: string; comp?: string; dia?: 'DESC' | TipoAusencia }>
  >({});

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
    dia: chosen[r.id]?.dia ?? 'DESC',
  });

  // Turno que tiene en la malla el día de la solicitud (si tiene uno de verdad)
  const turnoHoy = (r: Request): string | null => {
    const [y, m, d] = r.fecha.split('-').map(Number);
    const code = codeOn(r.worker_id, new Date(y, m - 1, d));
    return shifts[code]?.start ? code : null;
  };

  // Permiso o vacaciones registrado ese día (al aprobar un día libre como permiso)
  const permisoDe = (r: Request) =>
    licencias.find(
      (l) =>
        l.tipo !== 'LICENCIA' &&
        l.workerId === r.worker_id &&
        l.desde <= r.fecha &&
        r.fecha <= l.hasta
    );

  // Cuántas del mismo cargo y sucursal hay a cada hora ese día, hoy y si se aprueba
  const coverage = (r: Request, turno: string, comp: string) => {
    const w = workerById.get(r.worker_id);
    if (!w) return null;
    const [y, m, d] = r.fecha.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const span = (code: string) => {
      const sh = shifts[code];
      if (!sh?.start || !sh?.end) return null;
      const start = timeToMinutes(sh.start);
      let end = timeToMinutes(sh.end);
      if (end <= start) end += 1440;
      return { start, end };
    };
    const before: { start: number; end: number }[] = [];
    const after: { start: number; end: number }[] = [];
    workers.forEach((o) => {
      if (o.sucursal !== w.sucursal || o.cargo !== w.cargo) return;
      const now = codeOn(o.id, date);
      const next =
        o.id === r.worker_id
          ? turno
          : r.tipo === 'intercambio' && o.id === r.companera_id
            ? comp
            : now;
      const a = span(now);
      const b = span(next);
      if (a) before.push(a);
      if (b) after.push(b);
    });
    const all = [...before, ...after];
    if (all.length === 0) return null;
    const from = Math.floor(Math.min(...all.map((t) => t.start)) / 60);
    const to = Math.ceil(Math.max(...all.map((t) => t.end)) / 60) - 1;
    const count = (list: typeof before, at: number) =>
      list.filter((t) => t.start <= at && t.end > at).length;
    const rows = [];
    for (let h = from; h <= to; h++)
      rows.push({ hour: h, before: count(before, h * 60), after: count(after, h * 60) });
    // Lo más bajo entre las horas que cambian (las de apertura y cierre siempre son pocas)
    const changed = rows.filter((x) => x.before !== x.after);
    const min = changed.length
      ? changed.reduce((a, b) => (b.after < a.after ? b : a), changed[0])
      : null;
    return { cargo: w.cargo || 'personas', changed, min };
  };

  const pending = requests.filter((r) => r.status === 'pendiente');
  const answered = requests
    .filter((r) => r.status !== 'pendiente')
    .sort((a, b) => (b.resolved_at ?? b.created_at).localeCompare(a.resolved_at ?? a.created_at));
  const list = tab === 'pendientes' ? pending : answered;

  const resolve = async (r: Request, aprobar: boolean) => {
    setBusy(r.id);
    const pick = defaults(r);
    // Día libre como permiso: la malla mantiene el turno y después se marca el permiso,
    // que guarda el turno que tenía (igual que una licencia)
    const actual = turnoHoy(r);
    const comoPermiso =
      aprobar && r.tipo === 'libre' && pick.turno === 'DESC' && pick.dia !== 'DESC' && !!actual;
    const nota = (notes[r.id] ?? '').trim();
    const { error } = await supabase.rpc('resolve_shift_request', {
      p_id: r.id,
      p_aprobar: aprobar,
      p_respuesta: comoPermiso
        ? `${tipoLabel(pick.dia as TipoAusencia)}.${nota ? ` ${nota}` : ''}`
        : nota,
      p_turno: aprobar ? (comoPermiso ? actual : pick.turno) : null,
      p_turno_companera: aprobar && r.tipo === 'intercambio' ? pick.comp : null,
    });
    if (error) {
      setBusy(null);
      toast.error(error.message || 'No se pudo responder la solicitud.');
      return;
    }
    if (comoPermiso) {
      await registrarLicencia(r.worker_id, r.fecha, 1, pick.dia as TipoAusencia, r.motivo);
    }
    setBusy(null);
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
                        {r.tipo === 'libre' && permisoDe(r)
                          ? tipoLabel(permisoDe(r)!.tipo)
                          : shiftText(r.turno_pedido)}
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
                    {r.tipo === 'libre' && pick.turno === 'DESC' && turnoHoy(r) && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          Ese día tiene turno. ¿Cómo queda?
                        </span>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              ['PERMISO_CG', 'Permiso con goce'],
                              ['PERMISO_SG', 'Permiso sin goce'],
                              ['DESC', 'Descanso'],
                            ] as const
                          ).map(([code, label]) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() =>
                                setChosen((c) => ({ ...c, [r.id]: { ...c[r.id], dia: code } }))
                              }
                              aria-pressed={pick.dia === code}
                              className={`px-2 py-2 rounded-xl border text-xs font-semibold ${
                                pick.dia === code
                                  ? 'border-secondary bg-secondary text-white'
                                  : 'border-border text-muted-foreground hover:bg-muted/50'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {pick.dia !== 'DESC' && (
                          <span className="text-xs text-muted-foreground">
                            Se guarda el turno que tenía y después puedes imprimir la hoja para
                            firmar.
                          </span>
                        )}
                      </div>
                    )}
                    {r.tipo === 'intercambio' &&
                      r.companera_id &&
                      pickRow(comp, r.companera_id, pick.comp, r.turno_pedido, (v) =>
                        setChosen((c) => ({ ...c, [r.id]: { ...c[r.id], comp: v } }))
                      )}
                    {(() => {
                      const cov = coverage(r, pick.turno, pick.comp);
                      if (!cov) return null;
                      const { changed, min } = cov;
                      const max = Math.max(1, ...changed.map((x) => Math.max(x.before, x.after)));
                      const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
                      const plural = cov.cargo === 'Cajera' ? 'cajeras' : cov.cargo.toLowerCase();
                      return (
                        <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                            {plural} ese día si apruebas
                          </p>
                          {changed.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No cambia cuántas hay a ninguna hora.
                            </p>
                          ) : (
                            <div className="grid grid-cols-[3rem_1fr_4.5rem] gap-x-2 gap-y-1 items-center text-xs">
                              {changed.map((x) => (
                                <React.Fragment key={x.hour}>
                                  <span className="tabular-nums text-foreground">{hh(x.hour)}</span>
                                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${
                                        x.hour === min?.hour ? 'bg-amber-500' : 'bg-blue-500'
                                      }`}
                                      style={{ width: `${(x.after / max) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-right tabular-nums">
                                    <b
                                      className={
                                        x.hour === min?.hour ? 'text-amber-700' : 'text-foreground'
                                      }
                                    >
                                      {x.after}
                                    </b>{' '}
                                    <span className="text-muted-foreground">(hoy {x.before})</span>
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                          )}
                          {min && (
                            <p className="text-xs font-semibold text-amber-800 mt-1.5">
                              Lo más bajo: {min.after} {plural} a las {hh(min.hour)}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            Solo salen las horas que cambian. Si eliges otro turno arriba, se
                            recalcula.
                          </p>
                        </div>
                      );
                    })()}
                    {waiting && (
                      <p className="text-xs text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        Esperando que {comp?.name ?? 'la compañera'} acepte el cambio en su Mis
                        turnos.
                      </p>
                    )}
                  </div>
                )}

                {r.status === 'pendiente'
                  ? canResponder && (
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
                    )
                  : (r.respuesta || r.resolved_by_email) && (
                      <p className="text-xs text-muted-foreground">
                        {r.respuesta && <>Respuesta: «{r.respuesta}» </>}
                        {r.resolved_by_email && <>· {r.resolved_by_email}</>}
                      </p>
                    )}
                {r.status === 'aprobada' && r.tipo === 'libre' && permisoDe(r) && (
                  <button
                    type="button"
                    onClick={() =>
                      imprimirHoja(permisoDe(r)!, w, {
                        fecha: r.created_at.slice(0, 10),
                        autorizada: (r.resolved_at ?? r.created_at).slice(0, 10),
                      })
                    }
                    className="self-start flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold hover:bg-muted/50"
                  >
                    <Printer size={15} />
                    Imprimir hoja de permiso
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

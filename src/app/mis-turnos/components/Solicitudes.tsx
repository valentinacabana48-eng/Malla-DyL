'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Send, X } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/publicClient';

// Solicitudes de la trabajadora: pedir un día libre o un cambio de turno, y ver cómo van.

type Tipo = 'libre' | 'cambio' | 'intercambio';

interface Request {
  id: string;
  tipo: Tipo;
  fecha: string;
  turno_actual: string;
  turno_pedido: string;
  /** Cambio con compañera: por_preaprobar → elegir → pendiente (responde ella) → aceptada */
  companera_status: '' | 'por_preaprobar' | 'elegir' | 'pendiente' | 'aceptada' | 'rechazada';
  turno_companera?: string;
  /** La hizo ella (si no, se la pidió una compañera) */
  mia: boolean;
  /** Nombre de la compañera del cambio */
  otra: string | null;
  motivo: string;
  status: 'pendiente' | 'aprobada' | 'rechazada' | 'cancelada';
  respuesta: string;
}

interface ShiftOption {
  code: string;
  start: string;
  end: string;
}

// De las compañeras solo llega el nombre: no se muestran sus horarios
interface Coworker {
  id: string;
  name: string;
}

// "HH:MM" a minutos, para ordenar por hora
const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// Por hora de entrada y, si empiezan igual, por hora de salida
const byHour = (a: ShiftOption, b: ShiftOption) =>
  toMinutes(a.start) - toMinutes(b.start) || toMinutes(a.end) - toMinutes(b.end);

const STATUS: Record<Request['status'], { label: string; cls: string }> = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-900' },
  aprobada: { label: 'Aprobada', cls: 'bg-green-100 text-green-800' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
};

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function fechaText(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DOW[date.getDay()]} ${d} de ${MONTHS[m - 1]}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

export default function Solicitudes({
  token,
  fecha,
  onSessionEnd,
}: {
  token: string;
  /** Día elegido en el calendario (YYYY-MM-DD), para partir con ese día */
  fecha: string | null;
  onSessionEnd: () => void;
}) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState<Tipo>('libre');
  // Turnos que hay ese día entre sus compañeras (sin nombres)
  const [dayShifts, setDayShifts] = useState<ShiftOption[] | null>(null);
  const [mine, setMine] = useState('');
  // Elegir compañera después de la pre aprobación
  const [picking, setPicking] = useState<string | null>(null);
  const [coworkers, setCoworkers] = useState<Coworker[] | null>(null);
  const [companera, setCompanera] = useState('');
  const [pickError, setPickError] = useState('');
  const [day, setDay] = useState('');
  const [turno, setTurno] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const loadRequests = useCallback(async () => {
    const { data } = await getPublicSupabase().rpc('mis_turnos_requests', { p_token: token });
    const r = data as { ok: boolean; error?: string; requests?: Request[] } | null;
    if (r?.ok) setRequests(r.requests ?? []);
    else if (r?.error === 'sesion') onSessionEnd();
  }, [token, onSessionEnd]);

  const loadShifts = useCallback(async () => {
    const { data } = await getPublicSupabase().rpc('mis_turnos_shifts', { p_token: token });
    const r = data as { ok: boolean; shifts?: ShiftOption[] } | null;
    if (r?.ok) setShifts([...(r.shifts ?? [])].sort(byHour));
  }, [token]);

  useEffect(() => {
    loadRequests();
    loadShifts();
  }, [loadRequests, loadShifts]);

  // Turnos que tienen ese día sus compañeras, distintos al suyo
  useEffect(() => {
    if (!open || tipo !== 'intercambio' || !day) return;
    let active = true;
    setDayShifts(null);
    setTurno('');
    getPublicSupabase()
      .rpc('mis_turnos_day_shifts', { p_token: token, p_fecha: day })
      .then(({ data }) => {
        const r = data as { ok: boolean; mine?: string; shifts?: ShiftOption[] } | null;
        if (!active) return;
        setDayShifts(r?.ok ? [...(r.shifts ?? [])].sort(byHour) : []);
        setMine(r?.mine ?? '');
      });
    return () => {
      active = false;
    };
  }, [open, tipo, day, token]);

  // Ya pre aprobada: quiénes tienen ese turno ese día (solo nombres)
  const openPick = async (id: string) => {
    setPicking(id);
    setCoworkers(null);
    setCompanera('');
    setPickError('');
    const { data } = await getPublicSupabase().rpc('mis_turnos_coworkers', {
      p_token: token,
      p_id: id,
    });
    const r = data as { ok: boolean; error?: string; coworkers?: Coworker[] } | null;
    if (r?.error === 'sesion') return onSessionEnd();
    if (!r?.ok) setPickError(r?.error || 'No se pudo cargar.');
    setCoworkers(
      r?.ok ? [...(r.coworkers ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')) : []
    );
  };

  const pick = async (id: string) => {
    if (!companera) return setPickError('Elige a la compañera.');
    setSaving(true);
    setPickError('');
    try {
      const { data, error: rpcError } = await getPublicSupabase().rpc('mis_turnos_request_pick', {
        p_token: token,
        p_id: id,
        p_companera: companera,
      });
      if (rpcError) throw rpcError;
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) {
        if (r.error === 'sesion') return onSessionEnd();
        setPickError(r.error || 'No se pudo enviar.');
        return;
      }
      setPicking(null);
      setSent('Listo. Ahora tiene que aceptar tu compañera y después la jefatura.');
      await loadRequests();
    } catch {
      setPickError('No se pudo enviar. Revisa tu internet.');
    } finally {
      setSaving(false);
    }
  };

  const openForm = async () => {
    const min = todayIso();
    setDay(fecha && fecha >= min ? fecha : '');
    setTipo('libre');
    setTurno('');
    setMotivo('');
    setError('');
    setSent('');
    setOpen(true);
    if (shifts.length === 0) await loadShifts();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!day) return setError('Elige el día.');
    if (tipo !== 'libre' && !turno) return setError('Elige el turno que quieres.');
    setSaving(true);
    setError('');
    try {
      const { data, error: rpcError } = await getPublicSupabase().rpc('mis_turnos_request_create', {
        p_token: token,
        p_tipo: tipo,
        p_fecha: day,
        p_turno: tipo === 'libre' ? null : turno,
        p_motivo: motivo,
      });
      if (rpcError) throw rpcError;
      const r = data as { ok: boolean; error?: string };
      if (!r.ok) {
        if (r.error === 'sesion') return onSessionEnd();
        setError(r.error || 'No se pudo enviar.');
        return;
      }
      setOpen(false);
      setSent(
        tipo === 'intercambio'
          ? 'Solicitud enviada. Si la jefatura la pre aprueba, vas a poder elegir con quién cambiar.'
          : 'Solicitud enviada. Te avisamos aquí cuando la respondan.'
      );
      await loadRequests();
    } catch {
      setError('No se pudo enviar. Revisa tu internet.');
    } finally {
      setSaving(false);
    }
  };

  const answer = async (id: string, acepta: boolean) => {
    await getPublicSupabase().rpc('mis_turnos_request_answer', {
      p_token: token,
      p_id: id,
      p_acepta: acepta,
    });
    await loadRequests();
  };

  const cancel = async (id: string) => {
    await getPublicSupabase().rpc('mis_turnos_request_cancel', { p_token: token, p_id: id });
    await loadRequests();
  };

  const shiftText = (code: string) => {
    if (!code || code === 'DESC') return 'libre';
    const s = shifts.find((x) => x.code === code);
    return s ? `${s.start} a ${s.end}` : code;
  };

  const title = (r: Request) =>
    r.tipo === 'libre'
      ? 'Día libre'
      : r.tipo === 'cambio'
        ? `Turno ${shiftText(r.turno_pedido)}`
        : r.mia
          ? r.otra
            ? `Cambio con ${r.otra}`
            : 'Cambio con compañera'
          : `${r.otra ?? 'Una compañera'} te pide cambiar`;

  // Estado que ve ella en un cambio con compañera: pre aprobación, elegir, que acepte la compañera
  const statusOf = (r: Request) => {
    if (r.status === 'pendiente' && r.companera_status === 'por_preaprobar')
      return { label: 'Esperando a la jefatura', cls: 'bg-amber-100 text-amber-900' };
    if (r.status === 'pendiente' && r.companera_status === 'elegir')
      return { label: 'Pre aprobada: elige compañera', cls: 'bg-blue-100 text-blue-800' };
    if (r.status === 'pendiente' && r.companera_status === 'pendiente')
      return r.mia
        ? { label: 'Esperando a tu compañera', cls: 'bg-amber-100 text-amber-900' }
        : { label: 'Te toca responder', cls: 'bg-blue-100 text-blue-800' };
    return STATUS[r.status];
  };

  return (
    <div className="bg-white border border-slate-100 shadow-sm rounded-3xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-extrabold">Solicitudes</span>
        {!open && (
          <button
            type="button"
            onClick={openForm}
            className="h-10 px-3.5 rounded-xl bg-blue-700 text-white text-[13px] font-bold flex items-center gap-1.5"
          >
            <Send size={14} />
            Hacer una solicitud
          </button>
        )}
      </div>

      {sent && !open && (
        <p className="text-sm text-green-800 bg-green-50 rounded-lg px-2.5 py-2">{sent}</p>
      )}

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-3 border-t border-gray-100 pt-3">
          <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl">
            {(
              [
                ['libre', 'Día libre'],
                ['cambio', 'Otro turno'],
                ['intercambio', 'Con compañera'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTipo(key)}
                aria-pressed={tipo === key}
                className={`py-2.5 px-1 rounded-lg text-[13px] leading-tight font-bold ${
                  tipo === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-gray-700">Día</span>
            <input
              type="date"
              value={day}
              min={todayIso()}
              onChange={(e) => setDay(e.target.value)}
              className="h-12 px-3 rounded-xl border border-gray-300 bg-gray-50 text-base"
            />
          </label>

          {tipo === 'cambio' && (
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-gray-700">Turno que quieres</span>
              <select
                value={turno}
                onChange={(e) => setTurno(e.target.value)}
                className="h-12 px-3 rounded-xl border border-gray-300 bg-gray-50 text-base"
              >
                <option value="">Elige un turno</option>
                {shifts.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.start} a {s.end}
                  </option>
                ))}
              </select>
            </label>
          )}

          {tipo === 'intercambio' && day && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-gray-700">
                Turno que quieres {mine && <>(tú tienes {shiftText(mine)})</>}
              </span>
              {dayShifts === null ? (
                <p className="text-sm text-gray-500">Buscando turnos…</p>
              ) : dayShifts.length === 0 ? (
                <p className="text-sm text-gray-500">Ese día no hay otros turnos para cambiar.</p>
              ) : (
                <div className="flex flex-col rounded-xl border border-gray-300 overflow-hidden max-h-64 overflow-y-auto">
                  {dayShifts.map((sh) => (
                    <label
                      key={sh.code}
                      className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-b-0 ${
                        turno === sh.code ? 'bg-blue-50' : 'bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="turno"
                        checked={turno === sh.code}
                        onChange={() => setTurno(sh.code)}
                        className="w-5 h-5 accent-blue-700"
                      />
                      <span className="text-sm font-semibold text-gray-900">
                        {sh.start} a {sh.end}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-[13px] text-gray-500">
                Si la jefatura lo pre aprueba, después eliges con qué compañera cambiar.
              </p>
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-gray-700">Motivo (opcional)</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              rows={2}
              className="px-3 py-2.5 rounded-xl border border-gray-300 bg-gray-50 text-base"
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-12 rounded-xl border border-gray-300 text-gray-700 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-12 rounded-xl bg-blue-700 text-white font-bold disabled:opacity-60"
            >
              {saving ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      )}

      {requests.length === 0 && !open ? (
        <p className="text-[13px] text-gray-500">
          Si necesitas un día libre o cambiar un turno, pídelo aquí.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-gray-100">
          {requests.map((r) => (
            <li key={r.id} className="py-2.5 flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900">{title(r)}</p>
                  <p className="text-[13px] text-gray-600">{fechaText(r.fecha)}</p>
                  {r.tipo === 'intercambio' && (
                    <p className="text-[13px] text-gray-600">
                      {(() => {
                        // Solo su propio turno; el de la compañera no se muestra.
                        // Al aprobar, la jefa pudo ajustar el turno de la compañera
                        const yo = r.mia ? r.turno_pedido : r.turno_companera || r.turno_actual;
                        const verbo = r.status === 'aprobada' ? 'Quedaste' : 'Quedarías';
                        return `${verbo} ${shiftText(yo)}`;
                      })()}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-xs font-bold rounded-full px-2.5 py-1 text-center ${statusOf(r).cls}`}
                >
                  {statusOf(r).label}
                </span>
              </div>
              {r.motivo && <p className="text-[13px] text-gray-500">«{r.motivo}»</p>}
              {r.respuesta && (
                <p className="text-[13px] text-gray-800 bg-gray-50 rounded-lg px-2.5 py-1.5">
                  Respuesta: {r.respuesta}
                </p>
              )}
              {!r.mia && r.status === 'pendiente' && r.companera_status === 'pendiente' && (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => answer(r.id, false)}
                    className="h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold"
                  >
                    No acepto
                  </button>
                  <button
                    type="button"
                    onClick={() => answer(r.id, true)}
                    className="h-11 rounded-xl bg-blue-700 text-white text-sm font-bold"
                  >
                    Acepto el cambio
                  </button>
                </div>
              )}
              {r.mia &&
                r.status === 'pendiente' &&
                r.companera_status === 'elegir' &&
                (picking !== r.id ? (
                  <button
                    type="button"
                    onClick={() => openPick(r.id)}
                    className="self-start h-11 px-3.5 mt-1 rounded-xl bg-blue-700 text-white text-sm font-bold"
                  >
                    Elegir compañera
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 mt-1">
                    <span className="text-sm font-semibold text-gray-700">
                      Tienen {shiftText(r.turno_pedido)} ese día:
                    </span>
                    {coworkers === null ? (
                      <p className="text-sm text-gray-500">Buscando compañeras…</p>
                    ) : coworkers.length === 0 ? (
                      <p className="text-sm text-gray-500">Ya nadie tiene ese turno ese día.</p>
                    ) : (
                      <div className="flex flex-col rounded-xl border border-gray-300 overflow-hidden max-h-64 overflow-y-auto">
                        {coworkers.map((c) => (
                          <label
                            key={c.id}
                            className={`flex items-center gap-3 px-3 py-2.5 border-b border-gray-100 last:border-b-0 ${
                              companera === c.id ? 'bg-blue-50' : 'bg-white'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`companera-${r.id}`}
                              checked={companera === c.id}
                              onChange={() => setCompanera(c.id)}
                              className="w-5 h-5 accent-blue-700"
                            />
                            <span className="flex-1 min-w-0 text-sm font-semibold text-gray-900 truncate">
                              {c.name}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    {pickError && (
                      <p role="alert" className="text-sm text-red-700">
                        {pickError}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPicking(null)}
                        className="h-11 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold"
                      >
                        Volver
                      </button>
                      <button
                        type="button"
                        disabled={saving || !coworkers?.length}
                        onClick={() => pick(r.id)}
                        className="h-11 rounded-xl bg-blue-700 text-white text-sm font-bold disabled:opacity-60"
                      >
                        {saving ? 'Enviando...' : 'Pedirle el cambio'}
                      </button>
                    </div>
                  </div>
                ))}
              {r.mia && r.status === 'pendiente' && (
                <button
                  type="button"
                  onClick={() => cancel(r.id)}
                  className="self-start text-[13px] text-gray-600 underline flex items-center gap-1"
                >
                  <X size={13} />
                  Cancelar solicitud
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

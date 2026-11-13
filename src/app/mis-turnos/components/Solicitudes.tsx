'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronRight, Send, X } from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/publicClient';
import { EVENTO_CAMBIO } from '@/lib/misTurnosVivo';

// Solicitudes de la trabajadora: pedir un día libre o un cambio de turno, y ver cómo van.

type Tipo = 'libre' | 'cambio' | 'intercambio';

interface Request {
  id: string;
  tipo: Tipo;
  fecha: string;
  turno_actual: string;
  turno_pedido: string;
  /** Cambio con compañera: los turnos que le sirven (puede marcar varios) */
  turnos_opciones?: string[];
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
  /** Cuál de los turnos que ella marcó tiene la compañera */
  turno: string;
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

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0'
  )}`;

function todayIso() {
  return isoOf(new Date());
}

// «Otro turno» se pide solo para el mes siguiente: el mes en curso ya está armado
function nextMonth() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  return { min: isoOf(first), max: isoOf(last), name: MONTHS[first.getMonth()] };
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
  // Con compañera: puede marcar varios turnos que le sirven
  const [turnos, setTurnos] = useState<string[]>([]);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  // Por defecto se ven solo las pendientes; «Ver todas» muestra también las respondidas
  const [verTodas, setVerTodas] = useState(false);
  const mes = nextMonth();

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

  // En vivo: si la jefatura o una compañera responde, la lista se actualiza sola
  useEffect(() => {
    const onCambio = () => loadRequests();
    window.addEventListener(EVENTO_CAMBIO, onCambio);
    return () => window.removeEventListener(EVENTO_CAMBIO, onCambio);
  }, [loadRequests]);

  // Turnos que tienen ese día sus compañeras, distintos al suyo
  useEffect(() => {
    if (!open || tipo !== 'intercambio' || !day) return;
    let active = true;
    setDayShifts(null);
    setTurnos([]);
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
      setSent(
        'Listo. Ahora tiene que aceptar tu compañera y después la jefatura. Si no acepta, puedes elegir a otra.'
      );
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
    setTurnos([]);
    setMotivo('');
    setError('');
    setSent('');
    setOpen(true);
    if (shifts.length === 0) await loadShifts();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!day) return setError('Elige el día.');
    if (tipo === 'cambio' && (day < mes.min || day > mes.max))
      return setError(`Otro turno se pide solo para días de ${mes.name}.`);
    if (tipo === 'cambio' && !turno) return setError('Elige el turno que quieres.');
    if (tipo === 'intercambio' && turnos.length === 0)
      return setError('Marca al menos un turno que te sirva.');
    setSaving(true);
    setError('');
    try {
      const { data, error: rpcError } = await getPublicSupabase().rpc('mis_turnos_request_create', {
        p_token: token,
        p_tipo: tipo,
        p_fecha: day,
        p_turno: tipo === 'libre' ? null : tipo === 'intercambio' ? turnos[0] : turno,
        p_motivo: motivo,
        ...(tipo === 'intercambio' ? { p_turnos: turnos } : {}),
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

  // Mientras espera a la compañera: le retira la solicitud y vuelve a elegir a otra
  const otra = async (id: string) => {
    const { data } = await getPublicSupabase().rpc('mis_turnos_request_otra', {
      p_token: token,
      p_id: id,
    });
    const r = data as { ok: boolean; error?: string } | null;
    if (r?.error === 'sesion') return onSessionEnd();
    await loadRequests();
    if (r?.ok) openPick(id);
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

  // Turnos que le sirven, en texto: «08:00 a 16:00 o 09:00 a 17:00»
  const opcionesText = (r: Request) => {
    const ops = r.turnos_opciones?.length ? r.turnos_opciones : [r.turno_pedido];
    return ops.map(shiftText).join(' o ');
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
    <div className="bg-white border border-slate-200/70 rounded-3xl p-4 flex flex-col gap-3">
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
                onClick={() => {
                  setTipo(key);
                  if (key === 'cambio' && day && (day < mes.min || day > mes.max)) setDay('');
                }}
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
              min={tipo === 'cambio' ? mes.min : todayIso()}
              max={tipo === 'cambio' ? mes.max : undefined}
              onChange={(e) => setDay(e.target.value)}
              className="h-12 px-3 rounded-xl border border-gray-300 bg-gray-50 text-base"
            />
            {tipo === 'cambio' && (
              <span className="text-[13px] text-gray-500">
                Otro turno se pide solo para días de {mes.name}. El mes en curso ya está armado.
              </span>
            )}
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
                Turnos que te sirven {mine && <>(tú tienes {shiftText(mine)})</>}
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
                        turnos.includes(sh.code) ? 'bg-blue-50' : 'bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={turnos.includes(sh.code)}
                        onChange={(e) =>
                          setTurnos((prev) =>
                            e.target.checked
                              ? [...prev, sh.code]
                              : prev.filter((c) => c !== sh.code)
                          )
                        }
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
                Puedes marcar varios. Si la jefatura lo pre aprueba, después eliges con qué
                compañera cambiar, y si una no acepta, puedes elegir a otra.
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
        <ul className="flex flex-col gap-2.5">
          {(verTodas ? requests : requests.filter((x) => x.status === 'pendiente')).map((r) => {
            const st = statusOf(r);
            const [, mm, dd] = r.fecha.split('-').map(Number);
            const dow = DOW[new Date(Number(r.fecha.slice(0, 4)), mm - 1, dd).getDay()];
            const noAcepto = /no aceptó/.test(r.respuesta);
            // Paso del cambio con compañera en que va (solo las suyas, mientras está pendiente)
            const paso =
              r.tipo === 'intercambio' && r.mia && r.status === 'pendiente'
                ? ['por_preaprobar', 'elegir', 'pendiente', 'aceptada'].indexOf(r.companera_status)
                : -1;
            return (
              <li
                key={r.id}
                className={`rounded-2xl border p-3 flex gap-3 ${
                  r.status === 'pendiente'
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-100 bg-slate-50/60'
                }`}
              >
                {/* Fecha como hoja de calendario */}
                <div className="w-12 shrink-0 h-14 rounded-xl bg-slate-100 flex flex-col items-center justify-center leading-none">
                  <span className="text-[10px] font-semibold uppercase text-slate-500">
                    {dow.slice(0, 3)}
                  </span>
                  <span className="text-[20px] font-bold text-slate-900 mt-0.5">{dd}</span>
                  <span className="text-[10px] font-semibold uppercase text-slate-500 mt-0.5">
                    {MONTHS[mm - 1].slice(0, 3)}
                  </span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                  <div>
                    <p className="text-[15px] font-bold text-gray-900">{title(r)}</p>
                    {r.tipo === 'intercambio' && (
                      <p className="text-[13px] text-gray-600">
                        {(() => {
                          // Solo su propio turno; el de la compañera no se muestra.
                          // Al aprobar, la jefa pudo ajustar el turno de la compañera
                          const verbo = r.status === 'aprobada' ? 'Quedaste' : 'Quedarías';
                          // Antes de elegir compañera: cualquiera de los turnos que marcó
                          if (
                            r.mia &&
                            r.status === 'pendiente' &&
                            (r.companera_status === 'por_preaprobar' ||
                              r.companera_status === 'elegir')
                          )
                            return `${verbo} ${opcionesText(r)}`;
                          const yo = r.mia ? r.turno_pedido : r.turno_companera || r.turno_actual;
                          return `${verbo} ${shiftText(yo)}`;
                        })()}
                      </p>
                    )}
                    <span
                      className={`inline-block mt-1 text-[12px] font-semibold rounded-full px-2 py-0.5 ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>

                  {paso >= 0 && (
                    <div className="flex gap-1" aria-label={`Paso ${paso + 1} de 4`}>
                      {['Jefatura', 'Eliges', 'Compañera', 'Aprobación'].map((label, n) => (
                        <div key={label} className="flex-1 min-w-0">
                          <div
                            className={`h-1 rounded-full ${
                              n < paso ? 'bg-blue-600' : n === paso ? 'bg-blue-300' : 'bg-slate-200'
                            }`}
                          />
                          <p
                            className={`mt-0.5 text-[10px] truncate ${
                              n === paso ? 'font-bold text-blue-800' : 'text-slate-400'
                            }`}
                          >
                            {label}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {r.motivo && <p className="text-[13px] text-gray-500">«{r.motivo}»</p>}
                  {r.respuesta &&
                    (noAcepto && r.status === 'pendiente' ? (
                      <p className="flex items-start gap-1.5 text-[13px] text-amber-900 bg-amber-50 rounded-lg px-2.5 py-1.5">
                        <AlertCircle size={15} className="shrink-0 mt-px" aria-hidden="true" />
                        {r.respuesta}
                      </p>
                    ) : (
                      <p className="text-[13px] text-gray-700 bg-slate-100/70 rounded-lg px-2.5 py-1.5">
                        {r.respuesta}
                      </p>
                    ))}
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
                        className="self-start h-11 px-3.5 rounded-xl bg-blue-700 text-white text-sm font-bold"
                      >
                        {noAcepto ? 'Elegir otra compañera' : 'Elegir compañera'}
                      </button>
                    ) : (
                      <div className="flex flex-col gap-2 mt-1">
                        <span className="text-sm font-semibold text-gray-700">
                          Compañeras con {opcionesText(r)} ese día:
                        </span>
                        {coworkers === null ? (
                          <p className="text-sm text-gray-500">Buscando compañeras…</p>
                        ) : coworkers.length === 0 ? (
                          <p className="text-sm text-gray-500">
                            No queda ninguna compañera con ese turno ese día. Puedes cancelar la
                            solicitud y hacer otra.
                          </p>
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
                                {(r.turnos_opciones?.length ?? 0) > 1 && (
                                  <span className="shrink-0 text-[13px] text-gray-600">
                                    quedarías {shiftText(c.turno)}
                                  </span>
                                )}
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
                  {r.mia && r.status === 'pendiente' && r.companera_status === 'pendiente' && (
                    <button
                      type="button"
                      onClick={() => otra(r.id)}
                      className="self-start h-10 px-3 rounded-xl border border-gray-300 text-gray-700 text-[13px] font-semibold"
                    >
                      Pedírselo a otra compañera
                    </button>
                  )}
                  {r.mia && r.status === 'pendiente' && (
                    <button
                      type="button"
                      onClick={() => cancel(r.id)}
                      className="self-start text-[12px] text-gray-500 flex items-center gap-1"
                    >
                      <X size={13} />
                      Cancelar solicitud
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {requests.some((x) => x.status !== 'pendiente') && (
        <button
          type="button"
          onClick={() => setVerTodas((v) => !v)}
          className="self-end text-[13px] font-semibold text-blue-700 flex items-center gap-0.5"
        >
          {verTodas ? 'Ver solo pendientes' : `Ver todas (${requests.length})`}
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { getPublicSupabase } from '@/lib/supabase/publicClient';
import { dayKind, dayShort, dayText, monthKeyToLabel, type PublishedMonth } from '@/lib/misTurnos';

const TOKEN_KEY = 'dyl_mis_turnos_token';
const RUT_KEY = 'dyl_mis_turnos_rut';
const SEEN_KEY = 'dyl_mis_turnos_visto';

interface MonthData {
  name: string;
  sucursal: string;
  months: string[];
  month_key: string | null;
  days: PublishedMonth | null;
  prev_days: PublishedMonth | null;
  changed_days: number[];
  changed_at: string | null;
  published_at: string | null;
}

// ─── Guardado en el teléfono (puede fallar en modo privado) ──────────────────
function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function saveToken(token: string, remember: boolean) {
  try {
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch {
    // sin almacenamiento la sesión dura mientras la página esté abierta
  }
}

function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // nada que borrar
  }
}

function readLocal(key: string): string {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // no es crítico
  }
}

/** Fecha de hoy en Chile como "2026-10" y número de día */
function hoyChile(): { monthKey: string; day: number; date: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [y, m, d] = parts.split('-').map(Number);
  return { monthKey: `${y}-${String(m).padStart(2, '0')}`, day: d, date: new Date(y, m - 1, d) };
}

const DOWS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const DOW_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatFecha(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// ─── Pantalla de ingreso ─────────────────────────────────────────────────────
function LoginScreen({
  notice,
  onLoggedIn,
}: {
  notice: string;
  onLoggedIn: (token: string) => void;
}) {
  const [rut, setRut] = useState(() => readLocal(RUT_KEY));
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{4,6}$/.test(pin)) {
      setError('La clave tiene de 4 a 6 números.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: rpcError } = await getPublicSupabase().rpc('mis_turnos_login', {
        p_rut: rut,
        p_pin: pin,
        p_remember: remember,
      });
      if (rpcError) throw rpcError;
      const res = data as { ok: boolean; token?: string; error?: string };
      if (res.ok && res.token) {
        saveToken(res.token, remember);
        if (remember) writeLocal(RUT_KEY, rut);
        onLoggedIn(res.token);
        return;
      }
      setPin('');
      setError(
        res.error === 'bloqueada'
          ? 'Demasiados intentos. Espera 15 minutos e intenta de nuevo.'
          : 'RUT o clave incorrectos.'
      );
    } catch (err) {
      console.error('Mis turnos login:', err);
      setError('No se pudo conectar. Revisa tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[var(--app-height,100dvh)] flex flex-col bg-[#0f2744]">
      <div className="px-6 pt-16 pb-8 flex flex-col items-center gap-2.5 text-white text-center">
        <div className="w-16 h-16 rounded-[18px] bg-[#16355c] border border-[#3b5b8a] flex items-center justify-center">
          <CalendarDays size={30} aria-hidden="true" />
        </div>
        <h1 className="text-[28px] font-extrabold">Mis turnos</h1>
        <p className="text-[15px] text-indigo-200">DyL. Ingresa con tu RUT y tu clave</p>
      </div>
      <form
        onSubmit={handleSubmit}
        className="flex-1 bg-white rounded-t-[28px] px-6 py-8 flex flex-col gap-5 w-full max-w-md mx-auto"
      >
        {notice && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
            {notice}
          </p>
        )}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-gray-700">RUT</span>
          <input
            value={rut}
            onChange={(e) => {
              setRut(e.target.value);
              setError('');
            }}
            placeholder="12.345.678-9"
            autoComplete="username"
            autoCapitalize="characters"
            required
            className="h-[54px] border border-gray-300 rounded-[14px] px-4 text-lg font-medium text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-bold text-gray-700">Clave</span>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                setError('');
              }}
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="••••"
              required
              className="w-full h-[54px] border border-gray-300 rounded-[14px] pl-4 pr-14 text-[22px] font-bold tracking-[6px] text-gray-900 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="button"
              onClick={() => setShowPin((v) => !v)}
              aria-label={showPin ? 'Ocultar clave' : 'Mostrar clave'}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-gray-500"
            >
              {showPin ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </label>
        <label className="flex items-center gap-2.5 text-[15px] text-gray-700">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="w-[22px] h-[22px] rounded accent-blue-700"
          />
          Recordarme en este teléfono
        </label>
        {error && (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="h-14 rounded-[14px] bg-blue-700 text-white text-[17px] font-bold disabled:opacity-60"
        >
          {loading ? 'Ingresando...' : 'Ver mis turnos'}
        </button>
        <p className="text-[13px] text-gray-600 text-center leading-relaxed">
          ¿No tienes clave o la olvidaste? Pídesela a tu jefatura.
        </p>
      </form>
    </div>
  );
}

// ─── Calendario del mes ──────────────────────────────────────────────────────
function MonthScreen({
  data,
  loading,
  onChangeMonth,
  onRefresh,
  onLogout,
}: {
  data: MonthData;
  loading: boolean;
  onChangeMonth: (key: string) => void;
  onRefresh: () => void;
  onLogout: () => void;
}) {
  const hoy = hoyChile();
  const monthKey = data.month_key;
  const days = data.days ?? [];
  const changed = useMemo(() => new Set(data.changed_days ?? []), [data.changed_days]);
  const isCurrentMonth = monthKey === hoy.monthKey;
  const [selected, setSelected] = useState<number | null>(null);
  const seenKey = `${SEEN_KEY}:${monthKey}`;
  const [seen, setSeen] = useState(() => readLocal(seenKey));

  useEffect(() => {
    setSelected(isCurrentMonth ? hoy.day - 1 : null);
    setSeen(readLocal(seenKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  if (!monthKey) {
    return (
      <Shell data={data} onLogout={onLogout}>
        <div className="m-4 bg-white border border-gray-200 rounded-2xl p-6 text-center flex flex-col gap-3">
          <CalendarDays size={32} className="mx-auto text-blue-700" aria-hidden="true" />
          <p className="text-[17px] font-bold">Tu malla todavía no está publicada</p>
          <p className="text-sm text-gray-600">Cuando tu jefatura la publique, la verás aquí.</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mx-auto mt-1 h-11 px-4 rounded-xl border border-gray-300 text-sm font-semibold flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Volver a revisar
          </button>
        </div>
      </Shell>
    );
  }

  const [year, month] = monthKey.split('-').map(Number);
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7; // lunes = 0
  const cells: (number | null)[] = [...Array<null>(firstDow).fill(null), ...days.map((_, i) => i)];
  while (cells.length % 7 !== 0) cells.push(null);

  const idx = data.months.indexOf(monthKey);
  const prevMonth = idx > 0 ? data.months[idx - 1] : null;
  const nextMonth = idx >= 0 && idx < data.months.length - 1 ? data.months[idx + 1] : null;

  const showNotice = changed.size > 0 && !!data.changed_at && seen !== data.changed_at;
  const today = isCurrentMonth ? days[hoy.day - 1] : null;

  const sel = selected !== null ? days[selected] : undefined;
  const selDate = selected !== null ? new Date(year, month - 1, selected + 1) : null;

  return (
    <Shell data={data} onLogout={onLogout}>
      <div className="bg-[#0f2744] text-white px-4 pb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => prevMonth && onChangeMonth(prevMonth)}
          disabled={!prevMonth || loading}
          aria-label="Mes anterior"
          className="w-11 h-11 rounded-xl border border-[#3b5b8a] flex items-center justify-center disabled:opacity-30"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-lg font-bold">{monthKeyToLabel(monthKey)}</span>
        <button
          type="button"
          onClick={() => nextMonth && onChangeMonth(nextMonth)}
          disabled={!nextMonth || loading}
          aria-label="Mes siguiente"
          className="w-11 h-11 rounded-xl border border-[#3b5b8a] flex items-center justify-center disabled:opacity-30"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {showNotice && (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex flex-col gap-2">
            <p className="text-[15px] font-bold text-amber-900">
              Tu malla se actualizó el {formatFecha(data.changed_at)}
            </p>
            <p className="text-sm text-amber-900">
              {changed.size === 1 ? 'Cambió 1 día' : `Cambiaron ${changed.size} días`}, marcados con
              «Cambió». Toca un día para ver cómo estaba antes.
            </p>
            <button
              type="button"
              onClick={() => {
                writeLocal(seenKey, data.changed_at || '');
                setSeen(data.changed_at || '');
              }}
              className="self-start h-11 px-4 rounded-xl bg-amber-600 text-white text-sm font-bold"
            >
              Entendido
            </button>
          </div>
        )}

        {isCurrentMonth && (
          <div className="bg-white border border-gray-200 rounded-2xl px-3.5 py-3 flex flex-col gap-0.5">
            <span className="text-xs font-bold text-blue-700">
              HOY · {DOW_NAMES[hoy.date.getDay()].toUpperCase()} {hoy.day}
            </span>
            <span className="text-[17px] font-extrabold">
              {today?.s && today?.e && !today.esp
                ? `Entras ${today.s} · Sales ${today.e}`
                : dayText(today)}
            </span>
            {today?.col && !today.esp ? (
              <span className="text-[13px] text-gray-600">Colación {today.col} min</span>
            ) : null}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
            {DOWS.map((d) => (
              <span key={d} className="text-center text-[11px] font-extrabold text-gray-700 py-2">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((i, n) => {
              if (i === null)
                return (
                  <div
                    key={`v${n}`}
                    className="min-h-[66px] bg-gray-50 border-r border-b border-slate-100"
                  />
                );
              const d = days[i];
              const kind = dayKind(d);
              const isToday = isCurrentMonth && i === hoy.day - 1;
              const isSel = selected === i;
              const wasChanged = changed.has(i);
              const bg = isToday
                ? 'bg-blue-700 text-white'
                : kind === 'especial'
                  ? 'bg-blue-100 text-blue-900'
                  : kind === 'descanso'
                    ? 'bg-slate-50 text-slate-500'
                    : 'bg-white text-blue-700';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setSelected(i)}
                  aria-label={`Día ${i + 1}: ${dayText(d)}${wasChanged ? ', cambió' : ''}`}
                  aria-pressed={isSel}
                  className={`relative min-h-[66px] px-0.5 py-1 flex flex-col items-center gap-0.5 text-center border-r border-b border-slate-100 ${bg} ${
                    isSel && !isToday ? 'ring-2 ring-inset ring-blue-600' : ''
                  }`}
                >
                  <span className={`text-xs font-bold ${isToday ? 'text-white' : 'text-gray-900'}`}>
                    {i + 1}
                  </span>
                  <span className="text-[10px] font-bold leading-tight whitespace-pre-line">
                    {dayShort(d)}
                  </span>
                  {wasChanged && (
                    <span
                      className={`mt-auto text-[9px] font-extrabold uppercase rounded px-1 ${
                        isToday ? 'bg-white text-blue-800' : 'bg-amber-400 text-amber-950'
                      }`}
                    >
                      Cambió
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selected !== null && selDate && (
          <div className="bg-white border border-gray-200 rounded-2xl px-3.5 py-3 flex flex-col gap-1">
            <span className="text-sm font-bold text-gray-700">
              {DOW_NAMES[selDate.getDay()]} {selected + 1}
            </span>
            <span className="text-[17px] font-extrabold">{dayText(sel)}</span>
            {sel?.col && !sel.esp ? (
              <span className="text-[13px] text-gray-600">Colación {sel.col} min</span>
            ) : null}
            {changed.has(selected) && data.prev_days && (
              <span className="text-sm text-amber-800 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-1">
                Cambió. Antes: {dayText(data.prev_days[selected])}
              </span>
            )}
          </div>
        )}

        <p className="text-xs text-gray-500 text-center">
          Publicada el {formatFecha(data.published_at)}
        </p>
      </div>
    </Shell>
  );
}

function Shell({
  data,
  onLogout,
  children,
}: {
  data: MonthData;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[var(--app-height,100dvh)] bg-gray-100 text-gray-900">
      <div className="max-w-md mx-auto">
        <header className="bg-[#0f2744] text-white px-4 pt-5 pb-3.5 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[13px] text-indigo-200">{data.sucursal}</span>
            <h1 className="text-[21px] font-extrabold truncate">{data.name}</h1>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="h-10 px-3 rounded-[10px] border border-[#3b5b8a] text-[13px] font-semibold flex items-center gap-1.5 shrink-0"
          >
            <LogOut size={15} />
            Salir
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function MisTurnosContent() {
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [data, setData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async (tok: string, monthKey: string | null) => {
    setLoading(true);
    setLoadError('');
    try {
      const { data: res, error } = await getPublicSupabase().rpc('mis_turnos_get', {
        p_token: tok,
        p_month_key: monthKey,
      });
      if (error) throw error;
      const r = res as { ok: boolean; error?: string } & MonthData;
      if (!r.ok) {
        clearToken();
        setToken(null);
        setData(null);
        setNotice('Tu sesión terminó. Vuelve a ingresar.');
        return;
      }
      setData(r);
    } catch (err) {
      console.error('Mis turnos:', err);
      setLoadError('No se pudo cargar tu malla. Revisa tu internet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const tok = readToken();
    setToken(tok);
    setChecked(true);
    if (tok) load(tok, null);
  }, [load]);

  // Al volver a la app se revisa si hay cambios (sin conexión en vivo)
  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(token, data?.month_key ?? null);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token, data?.month_key, load]);

  const logout = async () => {
    const tok = token;
    clearToken();
    setToken(null);
    setData(null);
    setNotice('');
    if (tok) {
      try {
        await getPublicSupabase().rpc('mis_turnos_logout', { p_token: tok });
      } catch {
        // la sesión vence sola
      }
    }
  };

  if (!checked || (token && !data && !loadError)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0f2744]">
        <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-white animate-spin" />
      </div>
    );
  }

  if (!token) {
    return (
      <LoginScreen
        notice={notice}
        onLoggedIn={(tok) => {
          setNotice('');
          setToken(tok);
          load(tok, null);
        }}
      />
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-gray-100 p-6 text-center">
        <p className="text-[15px] font-semibold text-gray-800">{loadError}</p>
        <button
          type="button"
          onClick={() => load(token, null)}
          className="h-12 px-5 rounded-xl bg-blue-700 text-white font-bold"
        >
          Intentar de nuevo
        </button>
        <button type="button" onClick={logout} className="text-sm text-gray-600 underline">
          Salir
        </button>
      </div>
    );
  }

  return (
    <MonthScreen
      data={data}
      loading={loading}
      onChangeMonth={(key) => load(token, key)}
      onRefresh={() => load(token, data.month_key)}
      onLogout={logout}
    />
  );
}

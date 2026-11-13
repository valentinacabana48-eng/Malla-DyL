'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import localFont from 'next/font/local';
import {
  ClipboardCheck,
  Clock,
  Home,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Sun,
  Sunset,
  Coffee,
  Bell,
  MapPin,
  X,
} from 'lucide-react';
import { NON_WORKING_TYPES } from '@/context/AppContext';
import { safeInitials } from '@/lib/initials';
import { getPublicSupabase } from '@/lib/supabase/publicClient';
import AppImage from '@/components/ui/AppImage';
import Solicitudes from './Solicitudes';
import InstallBanner from './InstallBanner';
import AvisosBanner from './AvisosBanner';
import { apagarAvisosAlSalir, useMisTurnosEnVivo } from '@/lib/misTurnosVivo';

// Letra manuscrita para el título «Mis Turnos» (guardada en el proyecto, como la otra)
const letraTitulo = localFont({
  src: '../../fonts/KaushanScript-latin.woff2',
  weight: '400',
  display: 'swap',
});

type Vista = 'inicio' | 'solicitudes';

/** Lleva la pantalla a una sección (calendario, solicitudes) */
function irA(id: string) {
  if (id === 'arriba') return window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ¿Hay una sesión de la app de administración abierta en este navegador? Solo para mostrar
// el acceso directo: la administración pide su propio inicio de sesión igual.
function hasAdminSession(): boolean {
  try {
    if (document.cookie.split(';').some((c) => c.includes('auth-token'))) return true;
    return Object.keys(localStorage).some((k) => k.startsWith('sb_') && k.includes('auth-token'));
  } catch {
    return false;
  }
}

function useHasAdminSession(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => setHas(hasAdminSession()), []);
  return has;
}

const BRANCH_LOGOS = [
  { src: '/assets/images/descarga__2_-1784608577889.png', alt: 'Distribuidora DyL' },
  { src: '/assets/images/descarga__1_-1784608578251.png', alt: 'Mayorista DyL' },
  { src: '/assets/images/descarga-1784608578238.png', alt: 'Envases DyL' },
];

/** Logo de la empresa de la sucursal (Distribuidora, Mayorista o Envases) */
function logoSucursal(sucursal: string) {
  const s = sucursal.toLowerCase();
  if (s.includes('mayorista')) return BRANCH_LOGOS[1];
  if (s.includes('envase')) return BRANCH_LOGOS[2];
  return BRANCH_LOGOS[0];
}

function AdminLink({
  className,
  label = 'Administración',
}: {
  className: string;
  label?: React.ReactNode;
}) {
  return (
    <Link href="/" className={className} title="Administración" aria-label="Administración">
      <LayoutDashboard size={15} />
      {label}
    </Link>
  );
}
import {
  dayHours,
  dayKind,
  dayShort,
  dayText,
  dayTurno,
  fmtHoras,
  monthKeyToLabel,
  type PublishedDay,
  type PublishedMonth,
} from '@/lib/misTurnos';

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
const MES_CORTO = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];
const MES_LARGO = [
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
  const adminSession = useHasAdminSession();
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
          : res.error === 'sin_acceso'
            ? 'Tu área no tiene acceso a Mis turnos. Consulta tus turnos con tu jefatura.'
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
    <div className="min-h-[var(--app-height,100dvh)] flex flex-col bg-gradient-to-br from-[#0f2744] via-[#16386a] to-[#1d4ed8]">
      <div className="px-6 pt-16 pb-8 flex flex-col items-center gap-2.5 text-white text-center">
        <div className="flex items-center justify-center gap-3 mb-1">
          {BRANCH_LOGOS.map((logo) => (
            <div
              key={logo.alt}
              className="w-[72px] h-[72px] rounded-[18px] bg-white shadow-lg flex items-center justify-center p-1.5"
            >
              <AppImage
                src={logo.src}
                alt={logo.alt}
                width={64}
                height={64}
                className="object-contain w-full h-full"
              />
            </div>
          ))}
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
          className="h-14 rounded-[14px] bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[17px] font-bold shadow-lg shadow-blue-600/30 disabled:opacity-60"
        >
          {loading ? 'Ingresando...' : 'Ver mis turnos'}
        </button>
        <p className="text-[13px] text-gray-600 text-center leading-relaxed">
          ¿No tienes clave o la olvidaste? Pídesela a tu jefatura.
        </p>
        {adminSession && (
          <AdminLink className="h-12 rounded-[14px] border border-gray-300 text-gray-700 text-[15px] font-semibold flex items-center justify-center gap-2" />
        )}
      </form>
    </div>
  );
}

// ─── Calendario del mes ──────────────────────────────────────────────────────

/** Ícono de un día especial (🌴 vacaciones, 🏥 licencia, ...) */
function specialIcon(d: PublishedDay | null | undefined): string {
  if (!d?.esp) return '';
  return NON_WORKING_TYPES.find((t) => t.code === d.c)?.icon ?? '📌';
}

/** Colores de cada tipo de día: mañana celeste, tarde ámbar, libre verde, especial morado */
const HERO_STYLE = {
  manana: {
    bg: 'from-sky-400 to-blue-600',
    bar: 'bg-sky-500',
    soft: 'bg-sky-50 text-sky-700',
    Icon: Sun,
    label: 'Turno de mañana',
    short: 'Mañana',
  },
  tarde: {
    bg: 'from-amber-400 to-orange-600',
    bar: 'bg-amber-500',
    soft: 'bg-amber-50 text-amber-700',
    Icon: Sunset,
    label: 'Turno de tarde',
    short: 'Tarde',
  },
  libre: {
    bg: 'from-emerald-400 to-teal-600',
    bar: 'bg-emerald-500',
    soft: 'bg-emerald-50 text-emerald-700',
    Icon: Coffee,
    label: 'Día libre',
    short: 'Libre',
  },
  especial: {
    bg: 'from-violet-500 to-indigo-600',
    bar: 'bg-violet-500',
    soft: 'bg-violet-50 text-violet-700',
    Icon: CalendarDays,
    label: '',
    short: '',
  },
} as const;

function heroKind(d: PublishedDay | null | undefined): keyof typeof HERO_STYLE {
  const kind = dayKind(d);
  if (kind === 'especial') return 'especial';
  if (kind === 'turno') return dayTurno(d) === 'tarde' ? 'tarde' : 'manana';
  return 'libre';
}

/** Tarjeta de hoy: blanca y sobria, el color del turno solo en la franja y la etiqueta */
function TodayHero({
  label,
  d,
  manana,
}: {
  label: string;
  d: PublishedDay | null | undefined;
  /** Mañana, en una línea chica abajo */
  manana?: { label: string; d: PublishedDay | null | undefined };
}) {
  const k = heroKind(d);
  const turno = d?.s && d?.e && !d.esp;
  const horas = dayHours(d);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 to-sky-100 border border-blue-100 shadow-sm px-5 py-4">
      <div className="relative flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <span className="shrink-0 rounded-full bg-blue-700 text-white text-[14px] font-bold px-3 py-0.5">
            Hoy
          </span>
          <span className="text-[13px] font-medium text-slate-600 truncate">{label}</span>
        </span>
      </div>
      {turno ? (
        <>
          <p className="relative mt-3 text-[clamp(32px,10vw,42px)] leading-none font-extrabold tracking-tight text-slate-900 tabular-nums whitespace-nowrap">
            {d.s}
            <span className="mx-2">–</span>
            {d.e}
          </p>
          <p className="relative mt-3 flex items-center gap-1.5 text-[14px] font-medium text-slate-700">
            <Clock size={16} className="shrink-0" aria-hidden="true" />
            {fmtHoras(horas)} h de trabajo
            {d.col ? ` • Colación: ${d.col} min` : ''}
          </p>
        </>
      ) : (
        <p className="mt-2 text-[26px] leading-tight font-semibold text-slate-900">
          {k === 'especial' && <span className="mr-2">{specialIcon(d)}</span>}
          {k === 'libre' ? 'Día libre' : dayText(d)}
        </p>
      )}
      {manana && (
        <p className="relative mt-3 pt-3 border-t border-blue-200/60 flex items-center gap-2 text-[14px] text-slate-600">
          {(() => {
            const MIcon = HERO_STYLE[heroKind(manana.d)].Icon;
            return <MIcon size={15} className="text-slate-400 shrink-0" aria-hidden="true" />;
          })()}
          <span className="truncate">
            {manana.label}:{' '}
            <span className="font-semibold text-slate-900">
              {heroKind(manana.d) === 'especial' && (
                <span className="mr-1">{specialIcon(manana.d)}</span>
              )}
              {heroKind(manana.d) === 'libre' ? 'Libre' : dayText(manana.d)}
            </span>
          </span>
        </p>
      )}
    </div>
  );
}

function MonthScreen({
  token,
  data,
  loading,
  onChangeMonth,
  onRefresh,
  onLogout,
  onSessionEnd,
}: {
  token: string;
  onSessionEnd: () => void;
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
  // Solicitudes que esperan algo (número en la campanita)
  const [pendientes, setPendientes] = useState(0);
  // En el celular, Inicio y Solicitudes son pantallas separadas (en el computador se ven juntas)
  const [vista, setVista] = useState<Vista>('inicio');
  useEffect(() => {
    const onPop = () => setVista(history.state?.vista === 'solicitudes' ? 'solicitudes' : 'inicio');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const irAVista = (v: Vista) => {
    if (v !== vista) {
      // El botón «atrás» del celular vuelve a Inicio
      if (v === 'solicitudes') history.pushState({ vista: 'solicitudes' }, '');
      else if (history.state?.vista === 'solicitudes') history.back();
      setVista(v);
    }
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    // Sin día elegido al abrir: el de hoy ya sale arriba en grande
    setSelected(null);
    setSeen(readLocal(seenKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthKey]);

  if (!monthKey) {
    return (
      <Shell data={data} onLogout={onLogout} pendientes={pendientes}>
        <div className="mx-3 lg:mx-auto lg:max-w-xl bg-white rounded-3xl border border-slate-200/70 p-6 text-center flex flex-col gap-3">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <CalendarDays size={28} aria-hidden="true" />
          </span>
          <p className="text-[17px] font-bold">Tu malla todavía no está publicada</p>
          <p className="text-sm text-slate-600">Cuando tu jefatura la publique, la verás aquí.</p>
          <button
            type="button"
            onClick={onRefresh}
            className="mx-auto mt-1 h-11 px-4 rounded-xl border border-slate-300 text-sm font-semibold flex items-center gap-2"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Volver a revisar
          </button>
        </div>
        {/* Las solicitudes se pueden hacer y responder aunque aún no haya malla publicada */}
        <div className="m-3 lg:mx-auto lg:max-w-xl flex flex-col gap-3">
          <div className="bg-white rounded-2xl border border-slate-200/70 empty:hidden">
            <AvisosBanner token={token} />
          </div>
          <Solicitudes
            token={token}
            fecha={null}
            onSessionEnd={onSessionEnd}
            onPendientes={setPendientes}
          />
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
  // Mañana, si sigue dentro de este mes
  const manana = isCurrentMonth && hoy.day < days.length ? days[hoy.day] : undefined;
  const weeks: (number | null)[][] = [];
  for (let n = 0; n < cells.length; n += 7) weeks.push(cells.slice(n, n + 7));

  const mesLargo = MES_LARGO[month - 1];
  const sel = selected !== null ? days[selected] : undefined;
  const selDate = selected !== null ? new Date(year, month - 1, selected + 1) : null;

  // Resumen del mes
  const horasMes = days.reduce<number>((t, d) => t + dayHours(d), 0);
  const diasTrabajo = days.filter((d) => dayKind(d) === 'turno').length;
  const diasLibres = days.filter((d) => dayKind(d) === 'descanso').length;

  return (
    <Shell data={data} onLogout={onLogout} pendientes={pendientes} vista={vista} onVista={irAVista}>
      <div className="p-3 flex flex-col gap-3 lg:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6">
        <div
          className={`${vista === 'solicitudes' ? 'hidden lg:flex' : 'flex'} flex-col gap-3 lg:gap-4`}
        >
          {/* Primero lo que más se mira: el turno de hoy y de mañana */}
          {isCurrentMonth && (
            <>
              <TodayHero
                label={`${DOW_NAMES[hoy.date.getDay()]} ${hoy.day} de ${mesLargo}`}
                d={today}
                manana={
                  manana !== undefined
                    ? {
                        label: `Mañana ${DOW_NAMES[(hoy.date.getDay() + 1) % 7].toLowerCase()} ${hoy.day + 1}`,
                        d: manana,
                      }
                    : undefined
                }
              />
            </>
          )}

          {/* Horas y días del mes */}
          <div className="grid grid-cols-3 gap-2.5">
            {(
              [
                ['text-blue-700', `${fmtHoras(horasMes)} h`, `Trabajadas en ${mesLargo}`],
                ['text-violet-700', String(diasTrabajo), 'Días con turno'],
                ['text-amber-600', String(diasLibres), 'Días libres'],
              ] as const
            ).map(([color, valor, texto]) => (
              <div
                key={texto}
                className="bg-white rounded-2xl border border-slate-200/70 shadow-sm px-2 py-3 flex flex-col items-center text-center"
              >
                <p className={`text-[22px] font-extrabold leading-tight ${color}`}>{valor}</p>
                <p className="text-[12px] leading-tight text-slate-600">{texto}</p>
              </div>
            ))}
          </div>
          {showNotice && (
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-4 flex gap-3">
              <span className="w-10 h-10 shrink-0 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center">
                <Bell size={19} aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-2 min-w-0">
                <p className="text-[15px] font-bold text-amber-900">
                  Tu malla se actualizó el {formatFecha(data.changed_at)}
                </p>
                <p className="text-sm text-amber-900">
                  {changed.size === 1 ? 'Cambió 1 día' : `Cambiaron ${changed.size} días`}, marcados
                  con un punto naranjo. Toca un día para ver cómo estaba antes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    writeLocal(seenKey, data.changed_at || '');
                    setSeen(data.changed_at || '');
                  }}
                  className="self-start h-10 px-4 rounded-xl bg-amber-500 text-white text-sm font-bold"
                >
                  Entendido
                </button>
              </div>
            </div>
          )}

          {/* Avisos de instalar y de cambios, en una franja chica */}
          <div className="bg-white rounded-2xl border border-slate-200/70 divide-y divide-slate-100 empty:hidden">
            <InstallBanner />
            <AvisosBanner token={token} />
          </div>

          <div
            id="calendario"
            className="scroll-mt-3 bg-white rounded-3xl border border-slate-200/70 shadow-sm p-2 lg:p-3"
          >
            {/* «Mi Calendario» y el mes */}
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-2 pt-1.5 pb-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[16px] lg:text-[17px] font-bold text-slate-900 whitespace-nowrap">
                  <CalendarDays size={22} className="text-blue-700 shrink-0" aria-hidden="true" />
                  Mi Calendario
                </p>
              </div>
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <span className="text-[13px] lg:text-[14px] font-bold text-slate-900 mr-0.5 whitespace-nowrap">
                  {monthKeyToLabel(monthKey)}
                </span>
                <button
                  type="button"
                  onClick={() => prevMonth && onChangeMonth(prevMonth)}
                  disabled={!prevMonth || loading}
                  aria-label="Mes anterior"
                  className="w-9 h-9 rounded-full border border-slate-200 text-slate-600 flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => nextMonth && onChangeMonth(nextMonth)}
                  disabled={!nextMonth || loading}
                  aria-label="Mes siguiente"
                  className="w-9 h-9 rounded-full border border-slate-200 text-slate-600 flex items-center justify-center disabled:opacity-30"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_30px] lg:grid-cols-[repeat(7,minmax(0,1fr))_44px] gap-1 mb-1">
              {DOWS.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] lg:text-[12px] font-extrabold tracking-wider text-slate-400 py-1.5"
                >
                  {d}
                </span>
              ))}
              <span className="text-center text-[10px] lg:text-[12px] font-extrabold text-slate-300 py-1.5">
                h
              </span>
            </div>
            {weeks.map((week, w) => {
              const horas = week.reduce<number>(
                (t, i) => t + (i === null ? 0 : dayHours(days[i])),
                0
              );
              const parcial = week.some((i) => i === null);
              return (
                <React.Fragment key={w}>
                  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_30px] lg:grid-cols-[repeat(7,minmax(0,1fr))_44px] gap-1 mb-1">
                    {week.map((i, n) => {
                      if (i === null)
                        return <div key={`v${w}-${n}`} className="min-h-[62px] lg:min-h-[88px]" />;
                      const d = days[i];
                      const k = heroKind(d);
                      const isToday = isCurrentMonth && i === hoy.day - 1;
                      const isSel = selected === i;
                      const wasChanged = changed.has(i);
                      const tile = isToday
                        ? 'bg-blue-700 text-white'
                        : k === 'libre'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-white text-slate-700 border border-slate-200/80';
                      // Rayita de color: mañana celeste, tarde ámbar, vacaciones/permiso morado
                      const raya =
                        k === 'manana'
                          ? 'bg-sky-400'
                          : k === 'tarde'
                            ? 'bg-amber-400'
                            : k === 'especial'
                              ? 'bg-violet-400'
                              : '';
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setSelected(isSel ? null : i)}
                          aria-label={`${i + 1} de ${mesLargo}: ${dayText(d)}${wasChanged ? ', cambió' : ''}`}
                          aria-pressed={isSel}
                          className={`relative min-h-[62px] lg:min-h-[88px] rounded-xl px-0.5 py-1.5 lg:py-2 flex flex-col items-center gap-0.5 text-center transition-transform active:scale-95 ${tile} ${
                            isSel && !isToday ? 'ring-2 ring-blue-600 ring-offset-1' : ''
                          }`}
                        >
                          <span
                            className={`text-[13px] lg:text-sm font-extrabold leading-none ${isToday ? 'text-white' : 'text-slate-800'}`}
                          >
                            {i + 1}
                          </span>
                          {raya && !isToday && (
                            <span
                              className={`absolute top-0 left-2 right-2 h-[3px] rounded-b-full ${raya}`}
                              aria-hidden="true"
                            />
                          )}
                          {k === 'especial' ? (
                            <span className="text-[15px] leading-none mt-0.5">
                              {specialIcon(d)}
                            </span>
                          ) : k === 'libre' ? (
                            <span className="text-[10px] lg:text-[12px] font-semibold mt-0.5">
                              Libre
                            </span>
                          ) : (
                            <span className="text-[10px] lg:text-[13px] font-semibold leading-tight whitespace-pre-line">
                              {dayShort(d)}
                            </span>
                          )}

                          {wasChanged && (
                            <span
                              className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-white"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      );
                    })}
                    {/* Horas de la semana */}
                    <span
                      className="flex items-center justify-center text-[11px] lg:text-[13px] font-semibold text-slate-400 tabular-nums"
                      title={parcial ? 'Parte de esta semana es de otro mes' : undefined}
                    >
                      {horas > 0 ? fmtHoras(horas) : ''}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 px-2 pt-2 pb-1 text-[12px] text-slate-600">
              {(
                [
                  ['bg-sky-400', 'Mañana'],
                  ['bg-amber-400', 'Tarde'],
                  ['bg-violet-400', 'Permisos'],
                  ['bg-slate-300', 'Libre'],
                ] as const
              ).map(([c, t]) => (
                <span key={t} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${c}`} aria-hidden="true" />
                  {t}
                </span>
              ))}
            </div>
            <p className="text-center text-[11px] text-slate-400 pb-1">
              Columna h: horas de la semana · Toca un día para ver la colación
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:gap-4 lg:sticky lg:top-4">
          {selected !== null && selDate && (
            // En el celular sale como ventanita abajo; en el computador, en la columna
            <div
              className={`fixed inset-x-3 bottom-[76px] z-40 shadow-lg lg:static lg:inset-auto lg:z-auto lg:shadow-sm bg-white rounded-2xl border border-slate-200 pl-3 pr-1 py-1.5 ${vista === 'solicitudes' ? 'hidden lg:flex' : 'flex'} flex-col`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-1.5 h-6 shrink-0 rounded-full bg-gradient-to-b ${HERO_STYLE[heroKind(sel)].bg}`}
                  aria-hidden="true"
                />
                <span className="text-[13px] text-slate-700 truncate">
                  <b className="text-slate-900">
                    {DOW_NAMES[selDate.getDay()].slice(0, 3)} {selected + 1}
                  </b>
                  {' · '}
                  {heroKind(sel) === 'especial' && <span className="mr-1">{specialIcon(sel)}</span>}
                  {dayText(sel)}
                  {sel?.col && !sel.esp ? ` · colación ${sel.col} min` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Cerrar"
                  className="ml-auto w-8 h-8 shrink-0 rounded-full text-slate-400 flex items-center justify-center hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              </div>
              {changed.has(selected) && data.prev_days && (
                <span className="text-[12px] text-orange-800 pb-1 pl-3.5">
                  Cambió. Antes: {dayText(data.prev_days[selected])}
                </span>
              )}
            </div>
          )}

          <div className={vista === 'inicio' ? 'hidden lg:block' : ''}>
            <Solicitudes
              token={token}
              fecha={
                selected !== null && data.month_key
                  ? `${data.month_key}-${String(selected + 1).padStart(2, '0')}`
                  : null
              }
              onSessionEnd={onSessionEnd}
              onPendientes={setPendientes}
            />
          </div>

          <p
            className={`${vista === 'solicitudes' ? 'hidden lg:block' : ''} text-xs text-slate-400 text-center`}
          >
            Publicada el {formatFecha(data.published_at)}
          </p>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  data,
  onLogout,
  pendientes = 0,
  vista,
  onVista,
  children,
}: {
  data: MonthData;
  onLogout: () => void;
  /** Pantalla del celular; sin esto, los botones solo bajan hasta la sección */
  vista?: Vista;
  onVista?: (v: Vista) => void;
  /** Solicitudes que esperan algo: número en la campanita */
  pendientes?: number;
  children: React.ReactNode;
}) {
  const adminSession = useHasAdminSession();
  const primerNombre = data.name.split(' ')[0];
  return (
    <div className="min-h-[var(--app-height,100dvh)] bg-slate-50 text-slate-900">
      <div className="max-w-md lg:max-w-6xl mx-auto pb-24 lg:pb-6">
        {/* Encabezado azul con el nombre de la app y la campanita */}
        <header className="relative bg-gradient-to-br from-blue-800 via-blue-700 to-blue-500 text-white px-5 lg:px-6 pt-5 pb-12 overflow-hidden">
          <div className="relative flex items-center gap-3">
            <span className="w-14 h-14 shrink-0 rounded-full bg-white shadow-md flex items-center justify-center p-0.5">
              <AppImage
                src={logoSucursal(data.sucursal).src}
                alt={logoSucursal(data.sucursal).alt}
                width={56}
                height={56}
                className="object-contain w-full h-full"
              />
            </span>
            <p className={`${letraTitulo.className} flex-1 min-w-0 text-[30px] leading-none`}>
              Mis Turnos
            </p>
            <button
              type="button"
              onClick={() => (onVista ? onVista('solicitudes') : irA('solicitudes'))}
              aria-label={`Solicitudes${pendientes ? `: ${pendientes} pendientes` : ''}`}
              className="relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center hover:bg-white/10"
            >
              <Bell size={24} aria-hidden="true" />
              {pendientes > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[11px] font-bold flex items-center justify-center ring-2 ring-blue-700">
                  {pendientes}
                </span>
              )}
            </button>
            {adminSession && (
              <AdminLink
                label={<span className="hidden sm:inline">Admin</span>}
                className="h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[13px] font-semibold flex items-center gap-1.5"
              />
            )}
            <button
              type="button"
              onClick={onLogout}
              className="hidden lg:flex h-9 px-3 rounded-xl bg-white/10 border border-white/20 text-[13px] font-semibold items-center gap-1.5"
            >
              <LogOut size={15} />
              Salir
            </button>
          </div>
          {/* Ola de abajo */}
          <svg
            className="absolute bottom-0 left-0 w-full h-8 text-slate-50"
            viewBox="0 0 400 32"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M0 22 C 90 2, 170 34, 260 16 S 360 4, 400 14 L400 32 L0 32 Z"
              fill="currentColor"
            />
          </svg>
        </header>

        {/* Saludo */}
        <div className="relative px-5 lg:px-6 -mt-3 pb-3">
          <h1 className="text-[24px] font-extrabold leading-tight">Hola, {primerNombre} 👋</h1>
          <p className="text-[14px] text-slate-600">
            Que tengas un excelente día
            <span className="text-slate-400"> · {data.sucursal}</span>
          </p>
        </div>

        {children}
      </div>

      {/* Menú de abajo (celular) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto grid grid-cols-3">
          {(
            [
              ['inicio', 'arriba', 'Inicio', Home],
              ['solicitudes', 'solicitudes', 'Solicitudes', ClipboardCheck],
            ] as const
          ).map(([v, id, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => (onVista ? onVista(v) : irA(id))}
              aria-current={vista === v ? 'page' : undefined}
              className={`h-16 flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold ${
                vista === v ? 'text-blue-700' : 'text-slate-600'
              } active:text-blue-700`}
            >
              <Icon size={22} aria-hidden="true" />
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={onLogout}
            className="h-16 flex flex-col items-center justify-center gap-0.5 text-[12px] font-semibold text-slate-600"
          >
            <LogOut size={22} aria-hidden="true" />
            Salir
          </button>
        </div>
      </nav>
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

  // silent: recarga en segundo plano (cambio en vivo), sin mostrar error si falla
  const load = useCallback(async (tok: string, monthKey: string | null, silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoadError('No se pudo cargar tu malla. Revisa tu internet.');
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

  // En vivo: cuando publican o cambian su malla (o responden una solicitud), se recarga sola
  const monthKeyActual = data?.month_key ?? null;
  useMisTurnosEnVivo(token, () => {
    if (token) load(token, monthKeyActual, true);
  });

  // Al volver a la app también se revisa si hay cambios
  useEffect(() => {
    if (!token) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(token, data?.month_key ?? null, true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [token, data?.month_key, load]);

  const endSession = useCallback(() => {
    clearToken();
    setToken(null);
    setData(null);
    setNotice('Tu sesión terminó. Vuelve a ingresar.');
  }, []);

  const logout = async () => {
    const tok = token;
    clearToken();
    setToken(null);
    setData(null);
    setNotice('');
    if (tok) {
      await apagarAvisosAlSalir(tok);
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
      token={token}
      onSessionEnd={endSession}
      data={data}
      loading={loading}
      onChangeMonth={(key) => load(token, key)}
      onRefresh={() => load(token, data.month_key)}
      onLogout={logout}
    />
  );
}

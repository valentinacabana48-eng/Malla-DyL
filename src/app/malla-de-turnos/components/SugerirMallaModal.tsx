'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  useAppContext,
  monthLabelToKey,
  getChileanHolidays,
  type Worker,
} from '@/context/AppContext';
import {
  sugerirMalla,
  horarioDelGrupo,
  hhmm,
  LIBRE,
  type Aviso,
  type DiasConMasGente,
  type Momento,
  type SugerenciaResultado,
} from '@/lib/mallaSugerida';
import { MAX_CONSECUTIVE_DAYS, MIN_SUNDAYS_OFF } from '@/lib/compliance';

// Malla sugerida: la app propone los días vacíos del mes siguiendo la rotación de cada persona
// en el mes anterior. Primero se ve la propuesta; solo se guarda al tocar «Aceptar». Las
// trabajadoras no la ven hasta que se publica, como siempre.

interface Props {
  /** Trabajadoras que se están viendo en la Malla (filtros de sucursal, área…) */
  workers: Worker[];
  monthLabel: string;
  onClose: () => void;
}

const MESES = [
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
const LETRAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const storageKey = (sucursal: string, area: string) => `malla-sugerida:dias:${sucursal}:${area}`;

function loadDias(key: string, daysInMonth: number): DiasConMasGente[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const list = JSON.parse(raw) as DiasConMasGente[];
    return list
      .map((g) => ({ days: g.days.filter((d) => d >= 1 && d <= daysInMonth), count: g.count }))
      .filter((g) => g.days.length > 0);
  } catch {
    return [];
  }
}

function saveDias(key: string, list: DiasConMasGente[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Sin almacenamiento (modo privado): solo no se recuerda para el mes siguiente
  }
}

/** "30 y 31", "1, 2 y 3" */
function listaDias(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.length <= 1) return s.join('');
  return `${s.slice(0, -1).join(', ')} y ${s[s.length - 1]}`;
}

const ESPECIAL_CORTO: Record<string, string> = {
  DESCANSO: 'Libre',
  LICENCIA: 'Lic.',
  VACACIONES: 'Vac.',
  FERIADO: 'Fer.',
  CUMPLEANOS: '🎂',
  PERMISO_CG: 'Perm.',
  PERMISO_SG: 'Perm.',
};

const AVISO_STYLE: Record<Aviso['tipo'], string> = {
  ok: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  info: 'bg-slate-50 text-slate-700 border-slate-200',
  warn: 'bg-amber-50 text-amber-900 border-amber-200',
  error: 'bg-red-50 text-red-800 border-red-200',
};
const AVISO_ICON: Record<Aviso['tipo'], string> = { ok: '✅', info: '📌', warn: '⚠️', error: '❗' };

export default function SugerirMallaModal({ workers, monthLabel, onClose }: Props) {
  const {
    shifts,
    scheduleData,
    specialDays,
    bulkAssign,
    bulkAssignSpecialDay,
    isMonthLoaded,
    ensureMonths,
  } = useAppContext();

  const monthKey = monthLabelToKey(monthLabel);
  const [year, month] = monthKey.split('-').map(Number);
  const monthIdx = month - 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDate = new Date(year, monthIdx - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const mes = MESES[monthIdx];
  const mesAnterior = MESES[prevDate.getMonth()];
  const dow = (d: number) => (new Date(year, monthIdx, d).getDay() + 6) % 7;
  const firstDow = dow(1);

  useEffect(() => {
    if (!isMonthLoaded(prevKey)) ensureMonths([prevKey]);
  }, [prevKey, isMonthLoaded, ensureMonths]);
  const prevReady = isMonthLoaded(prevKey);

  const sucursales = useMemo(() => [...new Set(workers.map((w) => w.sucursal))], [workers]);
  const sucursal = sucursales.length === 1 ? sucursales[0] : null;
  const areasVistas = useMemo(
    () =>
      [...new Set(workers.map((w) => w.area || 'Sin área'))].sort((a, b) =>
        a.localeCompare(b, 'es')
      ),
    [workers]
  );
  const [area, setArea] = useState(areasVistas[0] ?? '');
  const grupo = useMemo(
    () => workers.filter((w) => (w.area || 'Sin área') === area),
    [workers, area]
  );

  // Días con más gente (se recuerdan por sucursal y área para el mes siguiente)
  const [dias, setDias] = useState<DiasConMasGente[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  useEffect(() => {
    if (!sucursal || !area) return;
    setDias(loadDias(storageKey(sucursal, area), daysInMonth));
    setEditing(null);
  }, [sucursal, area, daysInMonth]);
  const updateDias = (list: DiasConMasGente[]) => {
    setDias(list);
    if (sucursal && area)
      saveDias(
        storageKey(sucursal, area),
        list.filter((g) => g.days.length)
      );
  };

  const monthSched = useMemo(() => scheduleData[monthKey] || {}, [scheduleData, monthKey]);
  const monthSpecial = useMemo(() => specialDays[monthKey] || {}, [specialDays, monthKey]);
  const llenas = useMemo(() => {
    let n = 0;
    grupo.forEach((w) => {
      for (let i = 0; i < daysInMonth; i++)
        if (monthSched[w.id]?.[i] || monthSpecial[w.id]?.[i]) n++;
    });
    return n;
  }, [grupo, monthSched, monthSpecial, daysInMonth]);
  const libresAprobados = useMemo(() => {
    let n = 0;
    grupo.forEach((w) =>
      Object.values(monthSpecial[w.id] || {}).forEach((t) => {
        if (t) n++;
      })
    );
    return n;
  }, [grupo, monthSpecial]);

  const [resultado, setResultado] = useState<SugerenciaResultado | null>(null);
  const [saving, setSaving] = useState<{ done: number; total: number } | null>(null);

  const armar = () => {
    const r = sugerirMalla({
      year,
      monthIdx,
      workers: grupo,
      shifts,
      sched: monthSched,
      special: monthSpecial,
      prevSched: scheduleData[prevKey] || {},
      prevSpecial: specialDays[prevKey] || {},
      diasConMasGente: dias.filter((g) => g.days.length && g.count > 0),
      holidays: getChileanHolidays(monthIdx, year),
    });
    setResultado(r);
  };

  const aceptar = async () => {
    if (!resultado) return;
    // Lo que se va a guardar, solo en casillas que siguen vacías (alguien pudo editar mientras)
    const tareas: (() => Promise<unknown> | void)[][] = [];
    Object.entries(resultado.propuesta).forEach(([wid, cells]) => {
      const porTurno = new Map<string, number[]>();
      Object.entries(cells).forEach(([i, code]) => {
        const idx = Number(i);
        if (monthSched[wid]?.[idx] || monthSpecial[wid]?.[idx]) return;
        porTurno.set(code, [...(porTurno.get(code) ?? []), idx]);
      });
      const lista: (() => Promise<unknown> | void)[] = [];
      porTurno.forEach((idxs, code) =>
        lista.push(() =>
          code === LIBRE
            ? bulkAssignSpecialDay([wid], idxs, LIBRE, monthKey)
            : bulkAssign([wid], idxs, code, monthKey)
        )
      );
      if (lista.length) tareas.push(lista);
    });
    const total = tareas.length;
    if (!total) {
      onClose();
      return;
    }
    setSaving({ done: 0, total });
    let done = 0;
    // Cada persona en orden; varias personas a la vez
    let next = 0;
    const worker = async () => {
      while (next < tareas.length) {
        const mine = tareas[next++];
        for (const t of mine) await t();
        done++;
        setSaving({ done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, total) }, worker));
    toast.success(
      `✓ Malla sugerida guardada para ${total} persona(s). Revísala y publica cuando esté lista.`,
      {
        duration: 4000,
      }
    );
    onClose();
  };

  // ── Vista previa ──
  const filas = useMemo(() => {
    if (!resultado) return [];
    return grupo.filter((w) => resultado.propuesta[w.id]);
  }, [resultado, grupo]);
  const gentePorDia = useMemo(() => {
    const out = Array(daysInMonth).fill(0);
    if (!resultado) return out;
    filas.forEach((w) => {
      for (let i = 0; i < daysInMonth; i++) {
        const sug = resultado.propuesta[w.id]?.[i];
        const code = sug ?? monthSched[w.id]?.[i];
        if (monthSpecial[w.id]?.[i]) continue;
        if (code && code !== LIBRE && code !== 'DESC' && code !== 'NOT') out[i]++;
      }
    });
    return out;
  }, [resultado, filas, monthSched, monthSpecial, daysInMonth]);
  const pedidoPorDia = useMemo(() => {
    const m = new Map<number, { pedido: number; quedan: number; texto: string }>();
    resultado?.diasConMasGente.forEach((g) => {
      if (!m.has(g.day - 1))
        m.set(g.day - 1, { pedido: g.pedido, quedan: g.quedan, texto: g.momentoTexto.trim() });
    });
    return m;
  }, [resultado]);
  // Hora de apertura y cierre del grupo (lo más común en el mes anterior)
  const horario = useMemo(
    () => horarioDelGrupo(grupo, scheduleData[prevKey] || {}, specialDays[prevKey] || {}, shifts),
    [grupo, scheduleData, specialDays, prevKey, shifts]
  );

  const hora = (t: string | undefined) => {
    if (!t) return '';
    const [h, m] = t.split(':');
    return m === '00' ? h.padStart(2, '0') : `${h.padStart(2, '0')}:${m}`;
  };

  const celda = (w: Worker, i: number) => {
    const sug = resultado?.propuesta[w.id]?.[i];
    const sp = monthSpecial[w.id]?.[i];
    const code = monthSched[w.id]?.[i];
    const base =
      'w-11 h-10 rounded-md flex flex-col items-center justify-center leading-tight text-[10px] font-bold';
    if (sug) {
      if (sug === LIBRE)
        return (
          <div
            className={`${base} bg-slate-50 border border-dashed border-slate-300 text-slate-500 font-semibold`}
          >
            Libre
          </div>
        );
      const s = shifts[sug];
      return (
        <div
          className={`${base} bg-blue-50 border-[1.5px] border-dashed border-blue-400 text-blue-900`}
          title={s ? `${s.start}–${s.end} (sugerido)` : sug}
        >
          <span>{hora(s?.start)}</span>
          <span>{hora(s?.end)}</span>
        </div>
      );
    }
    if (sp)
      return (
        <div className={`${base} bg-violet-50 border border-violet-300 text-violet-800`} title={sp}>
          {ESPECIAL_CORTO[sp] ?? sp.slice(0, 4)}
        </div>
      );
    if (code) {
      const s = shifts[code];
      return (
        <div
          className={`${base} bg-card border border-slate-400 text-foreground`}
          title={s ? `${s.start}–${s.end}` : code}
        >
          <span>{hora(s?.start) || code}</span>
          <span>{hora(s?.end)}</span>
        </div>
      );
    }
    return <div className={`${base} border border-border`} />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-0 lg:p-4 animate-fade-in">
      <div
        className={`bg-card lg:rounded-2xl border border-border shadow-2xl w-full flex flex-col h-full lg:h-auto lg:max-h-[92vh] ${
          resultado ? 'lg:max-w-[1400px]' : 'lg:max-w-xl'
        }`}
      >
        {/* Encabezado */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            {resultado && !saving && (
              <button
                type="button"
                onClick={() => setResultado(null)}
                className="p-1.5 rounded-lg hover:bg-muted"
                aria-label="Volver"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center shrink-0">
              <Sparkles size={16} className="text-secondary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">
                {resultado ? `Propuesta de ${mes} · ${area}` : `Sugerir malla de ${mes}`}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                {resultado
                  ? 'Todavía no se guarda nada. Revisa y toca «Aceptar» para guardarla.'
                  : 'La app arma una propuesta. Nada se publica: tú la revisas y cambias lo que quieras.'}
              </p>
            </div>
          </div>
          {!saving && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
              <X size={16} className="text-muted-foreground" />
            </button>
          )}
        </div>

        {!sucursal ? (
          <div className="p-6 text-sm text-muted-foreground">
            Elige <strong>una sola sucursal</strong> en los filtros de la Malla para sugerir su
            malla.
          </div>
        ) : !resultado ? (
          /* ── Paso 1: qué sugerir ── */
          <div className="p-5 space-y-5 overflow-y-auto flex-1">
            <div>
              <label className="block text-sm font-bold mb-1.5">¿Para quiénes?</label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-secondary/30"
              >
                {areasVistas.map((a) => (
                  <option key={a} value={a}>
                    {a} · {workers.filter((w) => (w.area || 'Sin área') === a).length} personas
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">{sucursal}</p>
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">Días con más gente este mes</label>
              <p className="text-xs text-muted-foreground mb-2">
                Por ejemplo el cierre de mes. Puedes pedir la gente de todo el día, abriendo,
                cerrando o a una hora. La app mueve libres y turnos de esa semana para tenerla.
              </p>
              <div className="space-y-2">
                {dias.map((g, gi) => (
                  <div key={gi} className="border border-border rounded-xl">
                    <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setEditing(editing === gi ? null : gi)}
                        className="text-sm text-left flex-1 min-w-0"
                      >
                        📅{' '}
                        <strong>
                          {g.days.length ? `Día ${listaDias(g.days)}` : 'Elige los días'}
                        </strong>
                      </button>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={g.count || ''}
                        onChange={(e) =>
                          updateDias(
                            dias.map((x, k) =>
                              k === gi
                                ? { ...x, count: Math.max(0, parseInt(e.target.value || '0', 10)) }
                                : x
                            )
                          )
                        }
                        className="w-16 px-2 py-1.5 text-sm text-center border border-border rounded-lg bg-background"
                        aria-label="Personas"
                      />
                      <span className="text-sm text-muted-foreground">personas</span>
                      <button
                        type="button"
                        onClick={() => {
                          updateDias(dias.filter((_, k) => k !== gi));
                          setEditing(null);
                        }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                        aria-label="Quitar"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 px-3 pb-2.5 flex-wrap">
                      <select
                        value={g.momento ?? 'dia'}
                        onChange={(e) =>
                          updateDias(
                            dias.map((x, k) =>
                              k === gi
                                ? {
                                    ...x,
                                    momento: e.target.value as Momento,
                                    hora: x.hora ?? '18:00',
                                  }
                                : x
                            )
                          )
                        }
                        className="px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                        aria-label="Momento del día"
                      >
                        <option value="dia">Todo el día</option>
                        <option value="apertura">Abriendo</option>
                        <option value="cierre">Cerrando</option>
                        <option value="hora">A una hora</option>
                      </select>
                      {g.momento === 'hora' && (
                        <input
                          type="time"
                          value={g.hora ?? '18:00'}
                          onChange={(e) =>
                            updateDias(
                              dias.map((x, k) => (k === gi ? { ...x, hora: e.target.value } : x))
                            )
                          }
                          className="px-2 py-1.5 text-sm border border-border rounded-lg bg-background"
                          aria-label="Hora"
                        />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {g.momento === 'cierre' && horario.cierre !== null
                          ? `Turnos que terminan a las ${hhmm(horario.cierre - 30)} o después`
                          : g.momento === 'apertura' && horario.apertura !== null
                            ? `Turnos que empiezan a las ${hhmm(horario.apertura + 30)} o antes`
                            : g.momento === 'hora'
                              ? 'Quienes estén trabajando a esa hora'
                              : 'Quienes trabajen ese día'}
                      </span>
                    </div>
                    {editing === gi && (
                      <div className="px-3 pb-3">
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {LETRAS.map((l, k) => (
                            <div key={k} className="text-[10px] font-bold text-muted-foreground">
                              {l}
                            </div>
                          ))}
                          {Array.from({ length: firstDow }, (_, k) => (
                            <div key={`b${k}`} />
                          ))}
                          {Array.from({ length: daysInMonth }, (_, k) => {
                            const d = k + 1;
                            const on = g.days.includes(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() =>
                                  updateDias(
                                    dias.map((x, j) =>
                                      j === gi
                                        ? {
                                            ...x,
                                            days: on
                                              ? x.days.filter((y) => y !== d)
                                              : [...x.days, d],
                                          }
                                        : x
                                    )
                                  )
                                }
                                className={`h-8 rounded-lg text-xs font-semibold ${
                                  on
                                    ? 'bg-secondary text-white'
                                    : 'bg-muted/50 hover:bg-muted text-foreground'
                                }`}
                              >
                                {d}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="mt-2 text-xs font-semibold text-secondary"
                        >
                          Listo
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  updateDias([...dias, { days: [], count: 20 }]);
                  setEditing(dias.length);
                }}
                className="mt-2 flex items-center gap-1 text-sm font-semibold text-secondary"
              >
                <Plus size={14} /> Agregar días
              </button>
            </div>

            <div>
              <div className="text-sm font-bold mb-1.5">La propuesta va a respetar:</div>
              <ul className="text-sm space-y-1">
                <li>✅ La rotación de cada persona (sigue desde {mesAnterior})</li>
                <li>✅ Sus horas por semana</li>
                <li>✅ Máximo {MAX_CONSECUTIVE_DAYS} días seguidos</li>
                <li>
                  ✅ {MIN_SUNDAYS_OFF} domingos libres (menos quienes trabajan todos los domingos)
                </li>
                <li>
                  ✅ {libresAprobados > 0 ? `${libresAprobados} días` : 'Los días'} ya marcados
                  (libres aprobados, vacaciones, licencias)
                </li>
                <li>✅ La gente que pediste para cada día</li>
              </ul>
            </div>
            <p className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-3 py-2">
              Solo llena los días vacíos. Lo que ya está puesto no se toca
              {llenas > 0 ? ` (${llenas} casillas ya llenas)` : ''}.
            </p>
          </div>
        ) : (
          /* ── Paso 2: propuesta ── */
          <div className="flex-1 overflow-y-auto lg:overflow-hidden lg:flex lg:gap-4 p-4">
            <div className="lg:w-80 lg:shrink-0 lg:overflow-y-auto space-y-2 mb-4 lg:mb-0">
              <div className="text-sm font-bold">Revisión de la propuesta</div>
              {resultado.avisos.length === 0 && (
                <div className={`text-sm border rounded-xl px-3 py-2 ${AVISO_STYLE.info}`}>
                  No hay días vacíos para sugerir.
                </div>
              )}
              {resultado.avisos.map((a, k) => (
                <div
                  key={k}
                  className={`text-sm border rounded-xl px-3 py-2 ${AVISO_STYLE[a.tipo]}`}
                >
                  {AVISO_ICON[a.tipo]} {a.texto}
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0 lg:overflow-auto border border-border rounded-xl">
              <div className="overflow-x-auto">
                <table className="border-separate" style={{ borderSpacing: 3 }}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-card z-10" />
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const d = dow(i + 1);
                        return (
                          <th
                            key={i}
                            className={`text-[10px] font-bold ${d === 6 ? 'text-red-600' : 'text-muted-foreground'} ${pedidoPorDia.has(i) ? 'bg-amber-100 rounded-md' : ''}`}
                          >
                            {LETRAS[d]}
                            <br />
                            {i + 1}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((w) => (
                      <tr key={w.id}>
                        <td className="sticky left-0 bg-card z-10 pr-2 text-xs font-semibold whitespace-nowrap max-w-[130px] truncate">
                          {w.name}
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {w.horasContratadas ?? 42} h
                          </div>
                        </td>
                        {Array.from({ length: daysInMonth }, (_, i) => (
                          <td key={i}>{celda(w, i)}</td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td className="sticky left-0 bg-card z-10 pr-2 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                        Trabajan
                      </td>
                      {gentePorDia.map((n, i) => (
                        <td key={i}>
                          <div className="text-[10px] font-bold rounded-md py-1 text-center bg-muted/60 text-muted-foreground">
                            {n}
                          </div>
                        </td>
                      ))}
                    </tr>
                    {pedidoPorDia.size > 0 && (
                      <tr>
                        <td className="sticky left-0 bg-card z-10 pr-2 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
                          Lo que pediste
                        </td>
                        {gentePorDia.map((_, i) => {
                          const g = pedidoPorDia.get(i);
                          if (!g) return <td key={i} />;
                          const ok = g.quedan >= g.pedido;
                          return (
                            <td key={i}>
                              <div
                                title={`${g.quedan} de ${g.pedido}${g.texto ? ` ${g.texto}` : ''}`}
                                className={`text-[10px] font-bold rounded-md py-1 text-center leading-tight ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}
                              >
                                {g.quedan}/{g.pedido}
                                {g.texto && (
                                  <div className="text-[8px] font-semibold">
                                    {g.texto.replace('a las ', '')}
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 text-[11px] text-muted-foreground border-t border-border">
                <span className="flex items-center gap-1.5">
                  <i className="inline-block w-4 h-3 rounded border-[1.5px] border-dashed border-blue-400 bg-blue-50" />
                  Sugerido
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block w-4 h-3 rounded border border-dashed border-slate-300 bg-slate-50" />
                  Libre sugerido
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block w-4 h-3 rounded border border-violet-300 bg-violet-50" />
                  Ya marcado (libre aprobado, licencia…)
                </span>
                <span className="flex items-center gap-1.5">
                  <i className="inline-block w-4 h-3 rounded border border-slate-400" />
                  Ya puesto
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        {sucursal && (
          <div className="px-5 py-3.5 border-t border-border shrink-0 flex items-center justify-end gap-2 flex-wrap">
            {saving ? (
              <div className="flex-1 text-sm text-muted-foreground">
                Guardando… {saving.done} de {saving.total} personas
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-secondary transition-all"
                    style={{ width: `${(saving.done / saving.total) * 100}%` }}
                  />
                </div>
              </div>
            ) : resultado ? (
              <>
                <span className="mr-auto text-xs text-muted-foreground">
                  {resultado.casillas} casillas sugeridas para {resultado.conPropuesta} personas
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={aceptar}
                  disabled={resultado.casillas === 0}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-white hover:opacity-90 disabled:opacity-50"
                >
                  ✔ Aceptar y guardar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={armar}
                  disabled={!prevReady || grupo.length === 0}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-secondary text-white hover:opacity-90 disabled:opacity-50"
                >
                  {prevReady ? 'Armar propuesta' : `Cargando ${mesAnterior}…`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

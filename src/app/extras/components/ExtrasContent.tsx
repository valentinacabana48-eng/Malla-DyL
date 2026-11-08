'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { HandCoins, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { getSupabase } from '@/lib/supabase/client';
import { shiftsForSucursales, useAppContext, type Worker } from '@/context/AppContext';
import { formatRut } from '@/lib/rut';
import { fechaLargaAnio, pesos } from '@/lib/extras';
import { printElement } from '@/lib/printElement';
import {
  Ausentes,
  DaySheet,
  estadoAusencia,
  ordenAusentes,
  type Ausente,
  type WorkerShiftDetail,
} from '@/app/malla-de-turnos/components/MallaSummary';

// Extras del día: se elige el día y la sucursal, se ve quién tiene turno y se agregan
// extras (alguien del personal o una persona de afuera) con su horario y el valor a pagar.
// Al imprimir sale el horario con los EXTRA marcados y una hoja para pagar y firmar.

interface Extra {
  id: string;
  fecha: string;
  sucursal: string;
  worker_id: string | null;
  nombre: string;
  rut: string;
  cargo: string;
  /** Área a la que va el extra ('' en los guardados antes de existir la columna) */
  area?: string;
  /** Minutos de colación (0 si no tiene) */
  colacion?: number;
  inicio: string;
  fin: string;
  monto: number;
  nota: string;
}

interface Form {
  id?: string;
  area: string;
  workerId: string;
  nombre: string;
  rut: string;
  cargo: string;
  inicio: string;
  fin: string;
  monto: string;
  /** Minutos de colación, como texto del campo */
  colacion: string;
  nota: string;
}

const EMPTY: Form = {
  area: '',
  workerId: '',
  nombre: '',
  rut: '',
  cargo: '',
  inicio: '',
  fin: '',
  monto: '',
  colacion: '',
  nota: '',
};

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Hora siempre como HH:MM (algunos turnos están guardados como "9:00") */
const hhmm = (t: string) => {
  const [h = '', m = ''] = (t || '').split(':');
  if (!h) return '';
  return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0').slice(0, 2)}`;
};
const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};
/** Horas entre inicio y fin (si pasa la medianoche, cuenta hasta el otro día) */
function horas(inicio: string, fin: string): number {
  if (!inicio || !fin) return 0;
  let d = toMin(fin) - toMin(inicio);
  if (d <= 0) d += 24 * 60;
  return d / 60;
}
const fmtHoras = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} h`;
const soloNumeros = (s: string) => s.replace(/\D/g, '');

const inputClass =
  'w-full px-3 py-2.5 lg:py-2 rounded-xl border border-border bg-background text-base lg:text-sm text-foreground';
const labelClass = 'block text-xs font-semibold text-muted-foreground mb-1';

export default function ExtrasContent() {
  const supabase = getSupabase();
  const {
    workers,
    shifts,
    scheduleData,
    specialDays,
    sucursales,
    areasDeSucursales,
    areaCargos,
    getAllNonWorkingTypes,
    globalSucursal,
    ensureMonths,
    loading: appLoading,
  } = useAppContext();

  const [fecha, setFecha] = useState(hoyISO);
  const [sucursal, setSucursal] = useState('');
  const [area, setArea] = useState('Todas');
  const [cargo, setCargo] = useState('Todos');
  /** En el formulario: se eligió "Otro" y se escribe el cargo a mano */
  const [cargoLibre, setCargoLibre] = useState(false);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  // Sucursal: la elegida arriba en la app o la primera que se ve
  useEffect(() => {
    if (sucursal && sucursales.some((s) => s.name === sucursal)) return;
    const pref =
      globalSucursal && globalSucursal !== 'Todas' ? globalSucursal : sucursales[0]?.name;
    if (pref) setSucursal(pref);
  }, [sucursales, globalSucursal, sucursal]);

  const [y, m, d] = fecha.split('-').map(Number);
  const monthKey = `${y}-${String(m).padStart(2, '0')}`;
  const dayIndex = d - 1;

  useEffect(() => {
    if (y && m) ensureMonths([monthKey]);
  }, [monthKey, y, m, ensureMonths]);

  const areaOptions = useMemo(
    () => (sucursal ? areasDeSucursales([sucursal]) : []),
    [areasDeSucursales, sucursal]
  );
  useEffect(() => {
    if (area !== 'Todas' && !areaOptions.includes(area)) setArea('Todas');
  }, [areaOptions, area]);

  // Cargos de un área: los de Ajustes y los que tiene el personal de la sucursal
  const cargosDeArea = useCallback(
    (a: string) => {
      const set = new Set<string>();
      const areasVer = a && a !== 'Todas' ? [a] : areaOptions;
      areasVer.forEach((x) => (areaCargos[x] || []).forEach((c) => c && set.add(c)));
      workers.forEach((w) => {
        if (w.estado !== 'Activo' || w.sucursal !== sucursal) return;
        if (a && a !== 'Todas' && w.area !== a) return;
        const c = w.cargo || w.role;
        if (c) set.add(c);
      });
      return [...set].sort((x, y) => x.localeCompare(y, 'es'));
    },
    [areaCargos, areaOptions, workers, sucursal]
  );
  const cargoOptions = useMemo(() => cargosDeArea(area), [cargosDeArea, area]);
  useEffect(() => {
    if (cargo !== 'Todos' && !cargoOptions.includes(cargo)) setCargo('Todos');
  }, [cargoOptions, cargo]);

  const load = useCallback(async () => {
    if (!sucursal || !fecha) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('extras')
      .select('*')
      .eq('fecha', fecha)
      .eq('sucursal', sucursal)
      .order('inicio', { ascending: true });
    if (error) {
      setMissingTable(/extras/.test(error.message));
      console.error('Extras:', error);
      setExtras([]);
    } else {
      setMissingTable(false);
      setExtras(
        ((data as Extra[]) ?? []).map((e) => ({ ...e, inicio: hhmm(e.inicio), fin: hhmm(e.fin) }))
      );
    }
    setLoading(false);
  }, [supabase, fecha, sucursal]);

  useEffect(() => {
    load();
  }, [load]);

  const workerById = useMemo(() => new Map(workers.map((w) => [w.id, w])), [workers]);

  // Turnos de la sucursal (los de Ajustes), para elegir el horario del extra
  const turnosLista = useMemo(
    () =>
      Object.values(shiftsForSucursales(shifts, sucursal ? [sucursal] : []))
        .filter((t) => t.start && t.end)
        .map((t) => ({ ...t, start: hhmm(t.start), end: hhmm(t.end) }))
        .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end)),
    [shifts, sucursal]
  );

  // Todo el personal activo de la sucursal: sugerencias al escribir el nombre del extra
  const personalSucursal = useMemo(
    () =>
      workers
        .filter((w) => w.estado === 'Activo' && w.sucursal === sucursal)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [workers, sucursal]
  );

  // Área del extra: la que se eligió al agregarlo o, en los antiguos, la de la trabajadora
  const areaDeExtra = useCallback(
    (e: Extra) => e.area || (e.worker_id ? workerById.get(e.worker_id)?.area : '') || '',
    [workerById]
  );

  // Personal activo de la sucursal (y del área, si se eligió)
  const personal = useMemo(
    () =>
      workers
        .filter(
          (w) =>
            w.estado === 'Activo' &&
            w.sucursal === sucursal &&
            (area === 'Todas' || w.area === area) &&
            (cargo === 'Todos' || (w.cargo || w.role) === cargo)
        )
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [workers, sucursal, area, cargo]
  );

  // Quiénes tienen turno ese día, por hora de entrada
  const turnos = useMemo(() => {
    const monthSched = scheduleData[monthKey] || {};
    const monthSpecial = specialDays[monthKey] || {};
    const list: { w: Worker; inicio: string; fin: string; colacion: number }[] = [];
    personal.forEach((w) => {
      // Igual que la impresión de la Malla: con día especial (licencia, vacaciones…) no trabaja
      if (monthSpecial[w.id]?.[dayIndex]) return;
      const code = monthSched[w.id]?.[dayIndex];
      if (!code || code === 'DESC') return;
      const sh = shifts[code];
      if (!sh?.start || !sh?.end) return;
      list.push({ w, inicio: hhmm(sh.start), fin: hhmm(sh.end), colacion: sh.colacion ?? 0 });
    });
    return list.sort(
      (a, b) => a.inicio.localeCompare(b.inicio) || a.w.name.localeCompare(b.w.name, 'es')
    );
  }, [personal, scheduleData, specialDays, monthKey, dayIndex, shifts]);

  // Quién no viene ese día (licencia, vacaciones, permiso…), del área y cargo elegidos
  const ausentes = useMemo((): Ausente[] => {
    const monthSpecial = specialDays[monthKey] || {};
    const monthSched = scheduleData[monthKey] || {};
    const label = new Map(getAllNonWorkingTypes().map((t) => [t.code, t.label]));
    // El domingo no se listan los descansos (descansa casi todo el personal)
    const domingo = new Date(y, m - 1, d).getDay() === 0;
    // Quien vino de extra ese día no se cuenta como que no viene
    const conExtra = new Set(extras.map((e) => e.worker_id).filter(Boolean));
    return personal
      .filter((w) => !conExtra.has(w.id))
      .map((w) => ({
        name: w.name,
        estado: estadoAusencia(
          monthSpecial[w.id]?.[dayIndex],
          monthSched[w.id]?.[dayIndex],
          (c) => label.get(c) ?? c
        ),
      }))
      .filter((x): x is Ausente => !!x.estado && !(domingo && x.estado === 'Descanso'))
      .sort(ordenAusentes);
  }, [
    personal,
    extras,
    specialDays,
    scheduleData,
    monthKey,
    dayIndex,
    getAllNonWorkingTypes,
    y,
    m,
    d,
  ]);

  // Extras que se muestran: si se filtró por área, los del personal de esa área y los de afuera
  const extrasVisibles = useMemo(
    () =>
      extras.filter((e) => {
        // Sin cargo anotado se muestra igual, para que no se pierda
        if (cargo !== 'Todos' && e.cargo && e.cargo !== cargo) return false;
        if (area === 'Todas') return true;
        return areaDeExtra(e) === area || areaDeExtra(e) === '';
      }),
    [extras, area, cargo, areaDeExtra]
  );
  const total = extrasVisibles.reduce((s, e) => s + e.monto, 0);

  // Extras agrupados por área, cada grupo con su total (en pantalla y en la hoja de pago)
  const grupos = useMemo(() => {
    const map = new Map<string, Extra[]>();
    extrasVisibles.forEach((e) => {
      const a = areaDeExtra(e) || (area === 'Todas' ? 'Sin área' : area);
      map.set(a, [...(map.get(a) ?? []), e]);
    });
    const orden = (a: string) => {
      const i = areaOptions.indexOf(a);
      return i === -1 ? 999 : i;
    };
    return [...map.entries()]
      .sort(([a], [b]) => orden(a) - orden(b) || a.localeCompare(b, 'es'))
      .map(([nombre, lista]) => ({
        area: nombre,
        lista,
        total: lista.reduce((s, e) => s + e.monto, 0),
      }));
  }, [extrasVisibles, areaDeExtra, area, areaOptions]);

  // Horario del día con los extras metidos en su hora
  const horario = useMemo(() => {
    const rows = [
      ...turnos.map((t) => ({
        key: `t-${t.w.id}`,
        nombre: t.w.name,
        area: t.w.area,
        cargo: t.w.cargo || t.w.role,
        inicio: t.inicio,
        fin: t.fin,
        colacion: t.colacion,
        extra: false,
        nota: '',
      })),
      ...extrasVisibles.map((e) => {
        const w = e.worker_id ? workerById.get(e.worker_id) : undefined;
        return {
          key: `e-${e.id}`,
          nombre: e.nombre,
          // Sin área guardada: cuenta en el área elegida (la hoja de Cajas sigue con sus recuadros)
          area: areaDeExtra(e) || (area === 'Todas' ? '' : area),
          cargo: e.cargo || w?.cargo || '',
          inicio: e.inicio,
          fin: e.fin,
          colacion: e.colacion ?? 0,
          extra: true,
          nota: e.nota,
        };
      }),
    ];
    return rows.sort(
      (a, b) => a.inicio.localeCompare(b.inicio) || a.nombre.localeCompare(b.nombre, 'es')
    );
  }, [turnos, extrasVisibles, workerById, area, areaDeExtra]);

  // Hoja 1 igual a la impresión del día de la Malla (con los EXTRA marcados); hoja 2, el pago
  const hojaDia = useMemo(
    (): WorkerShiftDetail[] =>
      horario.map((r) => ({
        name: r.nombre,
        sucursal,
        area: r.area,
        shiftLabel: '',
        start: r.inicio,
        end: r.fin,
        colacion: r.colacion,
        extra: r.extra,
      })),
    [horario, sucursal]
  );

  const MESES_CAP = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];
  const dow = fecha ? fechaLargaAnio(fecha).split(' ')[0] : '';
  const diaTitulo = `${dow.charAt(0).toUpperCase()}${dow.slice(1)} ${d}`;
  const subtitulo = `${MESES_CAP[m - 1] ?? ''} ${y} · ${sucursal}${area === 'Todas' ? '' : ` · ${area}`}${cargo === 'Todos' ? '' : ` · ${plural(cargo)}`}`;
  // "Sábado 7 de noviembre" para el título de la hoja de pago
  const fechaPago = `${diaTitulo} de ${(MESES_CAP[m - 1] ?? '').toLocaleLowerCase('es')}`;

  const imprimir = () => {
    const el = document.getElementById('extras-print');
    if (!el) return;
    printElement(el, { title: `Horario y extras ${sucursal} ${fecha}` });
  };

  const abrirNuevo = () => {
    setCargoLibre(false);
    setForm({
      ...EMPTY,
      area: area === 'Todas' ? '' : area,
      cargo: cargo === 'Todos' ? '' : cargo,
    });
  };
  const abrirEditar = (e: Extra) => {
    setCargoLibre(false);
    setForm({
      id: e.id,
      area: areaDeExtra(e),
      workerId: e.worker_id ?? '',
      nombre: e.nombre,
      rut: e.rut,
      cargo: e.cargo,
      inicio: e.inicio,
      fin: e.fin,
      monto: String(e.monto),
      colacion: e.colacion ? String(e.colacion) : '',
      nota: e.nota,
    });
  };

  // Se escribe el nombre libremente; si coincide con alguien del personal, se toma su RUT
  const escribirNombre = (nombre: string) => {
    const key = nombre.trim().toLocaleLowerCase('es');
    const w = key
      ? personalSucursal.find((p) => p.name.toLocaleLowerCase('es') === key)
      : undefined;
    setForm((f) => {
      if (!f) return f;
      const antes = f.workerId ? workerById.get(f.workerId) : undefined;
      if (w)
        return {
          ...f,
          nombre,
          workerId: w.id,
          rut: w.rut || f.rut,
          area: f.area || w.area,
        };
      // Dejó de ser alguien del personal: se limpia lo que venía de su ficha
      return {
        ...f,
        nombre,
        workerId: '',
        rut: antes && f.rut === antes.rut ? '' : f.rut,
      };
    });
  };

  const guardar = async () => {
    if (!form) return;
    const nombre = form.nombre.trim();
    if (!form.area) return toast.error('Elige el área.');
    if (!nombre) return toast.error('Escribe el nombre.');
    if (!form.cargo.trim()) return toast.error('Elige a qué cargo viene.');
    if (!form.inicio || !form.fin) return toast.error('Falta la hora de inicio o de término.');
    if (form.inicio === form.fin)
      return toast.error('El inicio y el término no pueden ser iguales.');
    const monto = parseInt(soloNumeros(form.monto) || '0', 10);
    const row = {
      fecha,
      sucursal,
      worker_id: form.workerId || null,
      area: form.area,
      nombre,
      rut: form.rut.trim() ? formatRut(form.rut) : '',
      cargo: form.cargo.trim(),
      inicio: form.inicio,
      fin: form.fin,
      colacion: parseInt(soloNumeros(form.colacion) || '0', 10),
      monto,
      nota: form.nota.trim(),
    };
    setSaving(true);
    const save = (r: Partial<typeof row>) =>
      form.id
        ? supabase.from('extras').update(r).eq('id', form.id)
        : supabase.from('extras').insert(r);
    let { error } = await save(row);
    // Si todavía no se agregó la columna del área en Supabase, se guarda igual sin ella
    if (error && /colacion/.test(error.message)) {
      // Falta la columna de colación en Supabase: se guarda igual sin ella
      const { colacion: _c, ...sinColacion } = row;
      void _c;
      ({ error } = await save(sinColacion));
    }
    if (error && /area/.test(error.message)) {
      const { area: _a, colacion: _c, ...sinArea } = row;
      void _a;
      void _c;
      ({ error } = await save(sinArea));
    }
    setSaving(false);
    if (error) {
      console.error('Extras:', error);
      toast.error(error.message || 'No se pudo guardar.');
      return;
    }
    toast.success(form.id ? 'Extra actualizado.' : 'Extra agregado.');
    setForm(null);
    load();
  };

  const borrar = async (e: Extra) => {
    if (!confirm(`¿Quitar el extra de ${e.nombre}?`)) return;
    const { error } = await supabase.from('extras').delete().eq('id', e.id);
    if (error) {
      toast.error(error.message || 'No se pudo quitar.');
      return;
    }
    toast.success('Extra quitado.');
    load();
  };

  const turnoDe = (workerId: string | null) =>
    workerId ? turnos.find((t) => t.w.id === workerId) : undefined;

  return (
    <div className="p-4 lg:p-6 xl:p-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <HandCoins size={20} className="text-secondary" />
            Extras
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">
            Turnos del día, extras con su horario y lo que se paga
          </p>
        </div>
        <button
          type="button"
          onClick={imprimir}
          disabled={!sucursal || appLoading}
          className="flex items-center gap-2 bg-secondary text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-all shadow-sm"
        >
          <Printer size={16} />
          Imprimir
        </button>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 bg-card border border-border rounded-2xl p-4">
        <div>
          <label className={labelClass} htmlFor="ex-fecha">
            Día
          </label>
          <input
            id="ex-fecha"
            type="date"
            value={fecha}
            onChange={(e) => e.target.value && setFecha(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="ex-suc">
            Sucursal
          </label>
          <select
            id="ex-suc"
            value={sucursal}
            onChange={(e) => setSucursal(e.target.value)}
            className={inputClass}
          >
            {sucursales.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="ex-area">
            Área
          </label>
          <select
            id="ex-area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className={inputClass}
          >
            <option value="Todas">Todas</option>
            {areaOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="ex-cargo-filtro">
            Cargo
          </label>
          <select
            id="ex-cargo-filtro"
            value={cargo}
            onChange={(e) => setCargo(e.target.value)}
            className={inputClass}
          >
            <option value="Todos">Todos</option>
            {cargoOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <p className="sm:col-span-2 lg:col-span-4 text-sm font-semibold text-foreground first-letter:uppercase">
          {fecha && fechaLargaAnio(fecha)}
        </p>
      </div>

      {missingTable && (
        <p className="mb-5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          Falta preparar la base de datos para los extras (el SQL de Supabase). Mientras tanto
          puedes ver los turnos del día, pero no guardar extras.
        </p>
      )}

      {/* Extras */}
      <section className="bg-card border border-border rounded-2xl mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Extras del día
          </h2>
          <button
            type="button"
            onClick={abrirNuevo}
            disabled={missingTable || !sucursal}
            className="flex items-center gap-1.5 bg-secondary text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus size={16} />
            Agregar extra
          </button>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>
        ) : extrasVisibles.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aún no hay extras este día.
          </p>
        ) : (
          <>
            {grupos.map((g) => (
              <div key={g.area}>
                <div className="flex items-center justify-between gap-2 px-4 py-2 bg-muted/50 border-b border-border">
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    {tituloArea(g.area)}{' '}
                    <span className="font-semibold text-muted-foreground normal-case tracking-normal">
                      · {g.lista.length} {g.lista.length === 1 ? 'persona' : 'personas'}
                    </span>
                  </span>
                  <span className="text-sm font-extrabold text-foreground tabular-nums whitespace-nowrap">
                    {pesos(g.total)}
                  </span>
                </div>
                <ul className="divide-y divide-border border-b border-border">
                  {g.lista.map((e) => {
                    const t = turnoDe(e.worker_id);
                    return (
                      <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground">
                            {e.nombre}{' '}
                            <span className="ml-1 inline-block whitespace-nowrap align-middle text-[10px] font-extrabold tracking-wider text-amber-700 border border-amber-500 rounded px-1.5 py-0.5">
                              EXTRA
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.inicio} a {e.fin} · {fmtHoras(horas(e.inicio, e.fin))}
                            {e.colacion ? ` · colación ${e.colacion} min` : ''}
                            {areaDeExtra(e) && ` · ${areaDeExtra(e)}`}
                            {e.cargo && ` · ${e.cargo}`}
                            {!e.worker_id && ' · De afuera'}
                            {t && ` · Su turno: ${t.inicio} a ${t.fin}`}
                          </p>
                          {e.nota && (
                            <p className="text-xs text-muted-foreground italic">{e.nota}</p>
                          )}
                        </div>
                        <span className="text-sm font-bold text-foreground tabular-nums whitespace-nowrap">
                          {pesos(e.monto)}
                        </span>
                        <button
                          type="button"
                          onClick={() => abrirEditar(e)}
                          aria-label={`Editar extra de ${e.nombre}`}
                          className="w-9 h-9 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => borrar(e)}
                          aria-label={`Quitar extra de ${e.nombre}`}
                          className="w-9 h-9 rounded-lg hover:bg-red-50 flex items-center justify-center text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 py-3 bg-muted">
              <span className="text-sm font-bold text-foreground">
                {grupos.length > 1 ? 'Total de todas las áreas' : 'Total a pagar'}
              </span>
              <span className="text-base font-extrabold text-foreground tabular-nums">
                {pesos(total)}
              </span>
            </div>
          </>
        )}
      </section>

      {/* Horario del día */}
      <section className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Horario del día
          </h2>
          <span className="text-xs text-muted-foreground">
            {turnos.length} con turno · {extrasVisibles.length} extra
            {extrasVisibles.length === 1 ? '' : 's'}
          </span>
        </div>
        {appLoading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Cargando…</p>
        ) : horario.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nadie tiene turno este día.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="hidden sm:table-header-group">
              <tr className="text-left text-xs text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2 font-bold">Nombre</th>
                <th className="px-4 py-2 font-bold">Cargo</th>
                <th className="px-4 py-2 font-bold text-center">Entrada</th>
                <th className="px-4 py-2 font-bold text-center">Salida</th>
                <th className="px-4 py-2 font-bold text-center">Colación</th>
              </tr>
            </thead>
            <tbody>
              {horario.map((r) => (
                <tr
                  key={r.key}
                  className={`border-t border-border ${r.extra ? 'bg-amber-50' : ''}`}
                >
                  <td className="px-4 py-2">
                    <span className="font-semibold text-foreground">{r.nombre}</span>
                    {r.extra && (
                      <span className="ml-2 align-middle text-[10px] font-extrabold tracking-wider text-amber-700 border border-amber-500 rounded px-1.5 py-0.5">
                        EXTRA
                      </span>
                    )}
                    <span className="block sm:hidden text-xs text-muted-foreground">{r.cargo}</span>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-2 text-muted-foreground">
                    {r.cargo}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-center tabular-nums whitespace-nowrap">
                    {r.inicio}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-center tabular-nums whitespace-nowrap">
                    {r.fin}
                  </td>
                  <td className="px-2 sm:px-4 py-2 text-center tabular-nums whitespace-nowrap text-muted-foreground">
                    {r.colacion > 0 ? `${r.colacion} min` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {form && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">
                {form.id ? 'Editar extra' : 'Agregar extra'}
              </h2>
              <button
                type="button"
                onClick={() => setForm(null)}
                aria-label="Cerrar"
                className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={labelClass} htmlFor="ex-area-form">
                  Área
                </label>
                <select
                  id="ex-area-form"
                  value={form.area}
                  onChange={(e) => setForm({ ...form, area: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Elige…</option>
                  {areaOptions.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass} htmlFor="ex-nom">
                  Nombre
                </label>
                <input
                  id="ex-nom"
                  value={form.nombre}
                  onChange={(e) => escribirNombre(e.target.value)}
                  list="ex-personal"
                  autoComplete="off"
                  placeholder="Escribe el nombre"
                  className={inputClass}
                />
                <datalist id="ex-personal">
                  {personalSucursal.map((w) => (
                    <option key={w.id} value={w.name} />
                  ))}
                </datalist>
                {form.nombre.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {form.workerId
                      ? (() => {
                          const t = turnoDe(form.workerId);
                          return `Del personal${t ? ` · su turno: ${t.inicio} a ${t.fin}` : ''}`;
                        })()
                      : 'Persona de afuera'}
                  </p>
                )}
              </div>
              <div>
                <label className={labelClass} htmlFor="ex-rut">
                  RUT (opcional)
                </label>
                <input
                  id="ex-rut"
                  value={form.rut}
                  onChange={(e) => setForm({ ...form, rut: e.target.value })}
                  onBlur={() => form.rut && setForm({ ...form, rut: formatRut(form.rut) })}
                  placeholder="12.345.678-9"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ex-cargo">
                  Viene como (cargo)
                </label>
                {(() => {
                  const ops = cargosDeArea(form.area);
                  const libre = cargoLibre || (!!form.cargo && !ops.includes(form.cargo));
                  return (
                    <>
                      <select
                        id="ex-cargo"
                        value={libre ? '__otro' : form.cargo}
                        onChange={(e) => {
                          if (e.target.value === '__otro') {
                            setCargoLibre(true);
                            setForm({ ...form, cargo: '' });
                          } else {
                            setCargoLibre(false);
                            setForm({ ...form, cargo: e.target.value });
                          }
                        }}
                        className={inputClass}
                      >
                        <option value="">Elige…</option>
                        {ops.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                        <option value="__otro">Otro (escríbelo)</option>
                      </select>
                      {libre && (
                        <input
                          id="ex-cargo-otro"
                          value={form.cargo}
                          onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                          placeholder="Ej.: Descarga camión"
                          className={`${inputClass} mt-2`}
                        />
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <label className={labelClass} htmlFor="ex-turno">
                  Turno
                </label>
                <select
                  id="ex-turno"
                  value={
                    turnosLista.find((t) => t.start === form.inicio && t.end === form.fin)?.code ??
                    ''
                  }
                  onChange={(e) => {
                    const t = turnosLista.find((x) => x.code === e.target.value);
                    if (t)
                      setForm({
                        ...form,
                        inicio: t.start,
                        fin: t.end,
                        colacion: t.colacion ? String(t.colacion) : '',
                      });
                  }}
                  className={inputClass}
                >
                  <option value="">Otro horario (escríbelo abajo)</option>
                  {turnosLista.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.start} a {t.end}
                      {t.label && t.label !== `${t.start}-${t.end}` ? ` · ${t.label}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass} htmlFor="ex-ini">
                    Desde
                  </label>
                  <input
                    id="ex-ini"
                    type="time"
                    value={form.inicio}
                    onChange={(e) => setForm({ ...form, inicio: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="ex-fin">
                    Hasta
                  </label>
                  <input
                    id="ex-fin"
                    type="time"
                    value={form.fin}
                    onChange={(e) => setForm({ ...form, fin: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              {form.inicio && form.fin && form.inicio !== form.fin && (
                <p className="text-xs text-muted-foreground -mt-2">
                  {fmtHoras(horas(form.inicio, form.fin))}
                </p>
              )}

              <div>
                <label className={labelClass} htmlFor="ex-colacion">
                  Colación (minutos)
                </label>
                <input
                  id="ex-colacion"
                  inputMode="numeric"
                  value={form.colacion}
                  onChange={(e) => setForm({ ...form, colacion: soloNumeros(e.target.value) })}
                  placeholder="Sin colación"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass} htmlFor="ex-monto">
                  Valor a pagar
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <input
                    id="ex-monto"
                    inputMode="numeric"
                    value={form.monto ? parseInt(form.monto, 10).toLocaleString('es-CL') : ''}
                    onChange={(e) => setForm({ ...form, monto: soloNumeros(e.target.value) })}
                    placeholder="0"
                    className={`${inputClass} pl-7`}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass} htmlFor="ex-nota">
                  Nota (opcional)
                </label>
                <input
                  id="ex-nota"
                  value={form.nota}
                  onChange={(e) => setForm({ ...form, nota: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardar}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg bg-secondary text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lo que se imprime: hoja 1 igual a la del día de la Malla, hoja 2 el pago con firma */}
      <div className="hidden">
        <div id="extras-print" style={{ fontFamily: 'sans-serif', color: '#111' }}>
          <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>
            Horario — {diaTitulo}
          </h1>
          <p style={{ fontSize: '11px', color: '#555', marginBottom: '12px' }}>{subtitulo}</p>
          {hojaDia.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#888' }}>
              No hay turnos asignados para este día.
            </p>
          ) : (
            <DaySheet workerDetails={hojaDia} />
          )}
          <Ausentes ausentes={ausentes} />

          {(grupos.length === 0 ? [{ area: '', lista: [] as Extra[], total: 0 }] : grupos).map(
            (g, gi, todos) => (
              <div
                key={g.area || 'vacio'}
                style={{ breakBefore: 'page', pageBreakBefore: 'always' }}
              >
                <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>
                  Pago extra — {fechaPago}
                  {cargo !== 'Todos'
                    ? ` — ${plural(cargo)}`
                    : g.area
                      ? ` — ${tituloArea(g.area)}`
                      : ''}
                </h1>
                <p style={{ fontSize: '11px', color: '#555', marginBottom: '12px' }}>
                  {sucursal} · {y}
                </p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                  <thead>
                    <tr style={{ background: '#f3f4f6' }}>
                      <th style={{ ...P_TH, width: '28px' }}>N°</th>
                      <th style={{ ...P_TH, textAlign: 'left' }}>Nombre</th>
                      <th style={P_TH}>Horario</th>
                      <th style={{ ...P_TH, textAlign: 'right' }}>Monto</th>
                      <th style={{ ...P_TH, width: '32%' }}>Firma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lista.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ ...P_TD, textAlign: 'center', color: '#888' }}>
                          No hay extras este día.
                        </td>
                      </tr>
                    ) : (
                      g.lista.map((e, i) => (
                        <tr key={e.id}>
                          <td style={{ ...P_TD, textAlign: 'center' }}>{i + 1}</td>
                          <td style={{ ...P_TD, fontWeight: '600' }}>
                            {e.nombre}
                            {e.cargo && (
                              <div style={{ fontSize: '9px', color: '#6b7280', fontWeight: '400' }}>
                                {e.cargo}
                              </div>
                            )}
                          </td>
                          <td style={{ ...P_TD, textAlign: 'center' }}>
                            {e.inicio} a {e.fin}
                            {e.colacion ? (
                              <div style={{ fontSize: '9px', color: '#6b7280' }}>
                                colación {e.colacion} min
                              </div>
                            ) : null}
                          </td>
                          <td style={{ ...P_TD, textAlign: 'right', fontWeight: '700' }}>
                            {pesos(e.monto)}
                          </td>
                          <td style={{ ...P_TD, verticalAlign: 'bottom', paddingBottom: '8px' }}>
                            <div style={{ borderBottom: '1.2px solid #111', height: '26px' }} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {g.lista.length > 0 && (
                    <tfoot>
                      <tr>
                        <td style={P_TOTAL} />
                        <td colSpan={2} style={P_TOTAL}>
                          Total{' '}
                          {cargo !== 'Todos'
                            ? plural(cargo).toLocaleLowerCase('es')
                            : g.area
                              ? tituloArea(g.area).toLocaleLowerCase('es')
                              : 'a pagar'}
                        </td>
                        <td style={{ ...P_TOTAL, textAlign: 'right' }}>{pesos(g.total)}</td>
                        <td style={P_TOTAL} />
                      </tr>
                    </tfoot>
                  )}
                </table>
                {todos.length > 1 && gi === todos.length - 1 && (
                  <p
                    style={{
                      marginTop: '14px',
                      fontSize: '12px',
                      fontWeight: '700',
                      textAlign: 'right',
                    }}
                  >
                    Total de todas las áreas: {pesos(total)}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

const P_TH: React.CSSProperties = {
  textAlign: 'center',
  padding: '5px 6px',
  borderBottom: '2px solid #d1d5db',
  fontWeight: '700',
  fontSize: '10px',
  textTransform: 'uppercase',
};
const P_TD: React.CSSProperties = {
  padding: '6px',
  height: '44px',
  borderBottom: '1px solid #e5e7eb',
};
const P_TOTAL: React.CSSProperties = {
  padding: '6px',
  borderTop: '2px solid #374151',
  fontWeight: '700',
  fontSize: '12px',
  textTransform: 'uppercase',
};

// Cómo se nombra a la gente de cada área en el título de la hoja de pago
const NOMBRE_AREA: Record<string, string> = {
  Cajas: 'Cajeras',
  Bodega: 'Bodegueros',
  Sala: 'Reponedores',
  Tesorería: 'Tesoreras',
};
function tituloArea(area: string): string {
  return NOMBRE_AREA[area] ?? area;
}

/** "Cajera" → "Cajeras", "Jefa de Caja" → "Jefas de Caja" */
function plural(cargo: string): string {
  const [first, ...rest] = cargo.split(' ');
  if (!first) return cargo;
  const p = /[aeiouáéíóú]$/i.test(first) ? `${first}s` : `${first}es`;
  return [p, ...rest].join(' ');
}

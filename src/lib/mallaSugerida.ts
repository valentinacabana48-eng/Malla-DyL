import type { Shift, ShiftCode, Worker } from '@/context/AppContext';
import {
  evaluateMonth,
  isWorkedDay,
  shiftNetHours,
  MAX_CONSECUTIVE_DAYS,
  MIN_SUNDAYS_OFF,
} from '@/lib/compliance';

// Malla sugerida: arma una propuesta para los días vacíos de un mes siguiendo la rotación que
// cada persona tuvo el mes anterior (semana de mañana / semana de tarde, horario fijo, etc.).
// Después la corrige para respetar las reglas de Cumplimiento (máx. 6 días seguidos y 2 domingos
// libres) y para tener la gente pedida en los días con más trabajo (cierre de mes, fiestas).
// No guarda nada: devuelve la propuesta para que la jefatura la revise y la acepte.

export interface DiasConMasGente {
  /** Días del mes (desde 1) */
  days: number[];
  /** Personas que deben trabajar ese día (de las que se están sugiriendo) */
  count: number;
}

export interface SugerenciaInput {
  year: number;
  /** 0 = enero */
  monthIdx: number;
  workers: Worker[];
  shifts: Record<string, Shift>;
  sched: Record<string, ShiftCode[]>;
  special: Record<string, Record<number, string>>;
  prevSched: Record<string, ShiftCode[]>;
  prevSpecial: Record<string, Record<number, string>>;
  diasConMasGente: DiasConMasGente[];
  /** Feriados del mes (índice desde 0) */
  holidays?: number[];
}

export type AvisoTipo = 'ok' | 'warn' | 'error' | 'info';

export interface Aviso {
  tipo: AvisoTipo;
  texto: string;
  workerId?: string;
}

export interface DiaConMasGenteResultado {
  day: number;
  pedido: number;
  quedan: number;
}

export interface SugerenciaResultado {
  /** Solo las casillas sugeridas: workerId → { díaIndex: turno o LIBRE } */
  propuesta: Record<string, Record<number, string>>;
  /** Cuántas casillas se llenan */
  casillas: number;
  /** Personas con propuesta que cumplen todo */
  cumplen: number;
  conPropuesta: number;
  diasConMasGente: DiaConMasGenteResultado[];
  avisos: Aviso[];
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

/** Libre sugerido: se guarda como el día especial «DESCANSO», igual que los libres de siempre */
export const LIBRE = 'DESCANSO';

const DAY_MS = 86400000;
/** Una casilla del mes anterior que no sirve de modelo (licencia, vacaciones, cumpleaños…) */
const X = 'X';
type Clase = 'D' | 'M' | 'T';

/** Libre, de mañana o de tarde: para comparar semanas sin fijarse en el turno exacto */
function claseDe(code: string | null, shifts: Record<string, Shift>): Clase {
  if (!code || code === 'DESC' || code === 'NOT') return 'D';
  const start = shifts[code]?.start;
  if (!start) return 'T';
  const h = parseInt(start.split(':')[0], 10);
  return h < 12 ? 'M' : 'T';
}

const esLibre = (code: string | null | undefined) => !code || code === 'DESC' || code === 'NOT';

export function sugerirMalla(input: SugerenciaInput): SugerenciaResultado {
  const { year, monthIdx, workers, shifts } = input;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const prevDays = new Date(year, monthIdx, 0).getDate();
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const prevMonthIdx = (monthIdx + 11) % 12;
  const mes = MESES[monthIdx];
  const mesAnterior = MESES[prevMonthIdx];
  const dow = (d: number) => (new Date(year, monthIdx, d).getDay() + 6) % 7; // 0 = lunes, desde 1
  const isSunday = (i: number) => dow(i + 1) === 6;

  // Semanas completas (lunes a domingo) del mes anterior: son el modelo
  const mondays: number[] = [];
  for (let d = 1; d + 6 <= prevDays; d++) {
    if ((new Date(prevYear, prevMonthIdx, d).getDay() + 6) % 7 === 0) mondays.push(d);
  }
  const firstMonday = mondays.length ? new Date(prevYear, prevMonthIdx, mondays[0]).getTime() : 0;
  /** Número de semana (contando desde la primera semana completa del mes anterior) */
  const weekOf = (i: number) => {
    const d = new Date(year, monthIdx, i + 1);
    const monday = d.getTime() - dow(i + 1) * DAY_MS;
    return Math.round((monday - firstMonday) / (7 * DAY_MS));
  };

  const peakDays = new Map<number, number>();
  input.diasConMasGente.forEach((g) =>
    g.days.forEach((d) => {
      if (d >= 1 && d <= daysInMonth && g.count > 0)
        peakDays.set(d - 1, Math.max(peakDays.get(d - 1) ?? 0, g.count));
    })
  );

  const avisos: Aviso[] = [];
  const propuesta: Record<string, Record<number, string>> = {};

  interface Plan {
    worker: Worker;
    /** Turno de cada día del mes (lo que ya está + lo sugerido); null = día especial */
    A: (string | null)[];
    editable: boolean[];
    special: Record<number, string>;
    prevTail: number;
    sundayRule: boolean;
    /** Horas trabajadas en los días del mes anterior de la semana que cruza */
    prevWeekHours: number;
  }
  const plans: Plan[] = [];
  const sinBase: string[] = [];
  const conLicencia: string[] = [];
  const sinRotacion: string[] = [];

  workers.forEach((w) => {
    const cur = input.sched[w.id] || [];
    const sp = input.special[w.id] || {};
    const prev = input.prevSched[w.id] || [];
    const prevSp = input.prevSpecial[w.id] || {};

    const empty: boolean[] = [];
    for (let i = 0; i < daysInMonth; i++) empty.push(!cur[i] && !sp[i]);
    if (!empty.some(Boolean)) return; // ya está completa

    let workedPrev = 0;
    for (let i = 0; i < prevDays; i++) if (isWorkedDay(prev[i], prevSp[i])) workedPrev++;
    if (workedPrev === 0 || mondays.length === 0) {
      sinBase.push(w.name);
      return;
    }

    // Semanas modelo: 7 casillas cada una (turno, null = libre, X = no sirve)
    const weeks: (string | null)[][] = mondays.map((m) =>
      Array.from({ length: 7 }, (_, k) => {
        const idx = m - 1 + k;
        // El libre se marca como día especial «DESCANSO»; los demás (licencia…) no sirven
        if (prevSp[idx]) return prevSp[idx] === 'DESCANSO' ? null : X;
        return prev[idx] ?? null;
      })
    );
    const unknown = weeks.flat().filter((c) => c === X).length;

    // ¿Cada cuántas semanas se repite? (1 = igual todas, 2 = una de mañana y otra de tarde…)
    const n = weeks.length;
    let period = 1;
    let bestScore = Infinity;
    let bestRaw = 0;
    for (let p = 1; p <= Math.min(3, Math.max(1, n - 1)); p++) {
      let mism = 0;
      let tot = 0;
      for (let k = p; k < n; k++)
        for (let d = 0; d < 7; d++) {
          const a = weeks[k][d];
          const b = weeks[k - p][d];
          if (a === X || b === X) continue;
          tot++;
          if (claseDe(a, shifts) !== claseDe(b, shifts)) mism++;
        }
      const raw = tot ? mism / tot : n > 1 ? 1 : 0;
      const score = raw + 0.04 * (p - 1);
      if (score < bestScore) {
        bestScore = score;
        bestRaw = raw;
        period = p;
      }
    }

    // Turnos más usados (para cuando la semana modelo tiene un día que no sirve)
    const counts = new Map<string, number>();
    weeks.flat().forEach((c) => {
      if (c && c !== X && !esLibre(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    });
    const masUsado = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // La semana que cruza de mes ya empezó en el mes anterior: se elige la parte de la rotación
    // que calza con esos días (si terminó en semana de tarde, sigue la de mañana, etc.)
    let phase = 0;
    const tailStart = mondays[n - 1] + 7; // primer día (desde 1) de la semana que cruza
    if (period > 1 && tailStart <= prevDays) {
      let best = Infinity;
      for (let ph = 0; ph < period; ph++) {
        const tpl = weeks[n - period + ph];
        let mism = 0;
        for (let d = tailStart; d <= prevDays; d++) {
          const real = prevSp[d - 1]
            ? prevSp[d - 1] === 'DESCANSO'
              ? null
              : X
            : (prev[d - 1] ?? null);
          const t = tpl[d - tailStart];
          if (real === X || t === X) continue;
          if (claseDe(real, shifts) !== claseDe(t, shifts)) mism++;
        }
        if (mism < best) {
          best = mism;
          phase = ph;
        }
      }
    }

    const modelo = (k: number, d: number): string | null => {
      const base = n - period + ((((k - n + phase) % period) + period) % period);
      for (let idx = base; idx >= 0; idx -= period) {
        const c = weeks[idx][d];
        if (c !== X) return c;
      }
      for (let idx = n - 1; idx >= 0; idx--) {
        const c = weeks[idx][d];
        if (c !== X) return c;
      }
      return masUsado;
    };

    const A: (string | null)[] = [];
    const editable: boolean[] = [];
    for (let i = 0; i < daysInMonth; i++) {
      if (sp[i]) {
        A.push(null);
        editable.push(false);
      } else if (!empty[i]) {
        A.push(cur[i] as string);
        editable.push(false);
      } else {
        const c = modelo(weekOf(i), dow(i + 1));
        A.push(c && !esLibre(c) ? c : 'DESC');
        editable.push(true);
      }
    }

    // Días seguidos con que termina el mes anterior
    let prevTail = 0;
    for (let i = prevDays - 1; i >= 0; i--) {
      if (!isWorkedDay(prev[i], prevSp[i])) break;
      prevTail++;
    }
    let totalSundays = 0;
    for (let i = 0; i < daysInMonth; i++) if (isSunday(i)) totalSundays++;
    let prevWeekHours = 0;
    for (let k = 1; k <= dow(1); k++) {
      const idx = prevDays - k;
      if (isWorkedDay(prev[idx], prevSp[idx]))
        prevWeekHours += shiftNetHours(shifts[prev[idx] as string]);
    }

    plans.push({
      worker: w,
      A,
      editable,
      special: sp,
      prevTail,
      sundayRule: !w.exentoDomingos && totalSundays >= MIN_SUNDAYS_OFF,
      prevWeekHours,
    });

    if (unknown >= 7) conLicencia.push(w.name);
    else if (bestRaw > 0.5) sinRotacion.push(w.name);
  });
  if (sinBase.length)
    avisos.push({
      tipo: 'error',
      texto: `Sin turnos en ${mesAnterior}, quedaron vacías (asígnales a mano): ${sinBase.join(', ')}.`,
    });
  if (conLicencia.length)
    avisos.push({
      tipo: 'warn',
      texto: `Estuvieron con licencia o vacaciones en ${mesAnterior}, revisa sus turnos: ${conLicencia.join(', ')}.`,
    });
  if (sinRotacion.length)
    avisos.push({
      tipo: 'warn',
      texto: `No tuvieron una rotación pareja en ${mesAnterior}, revisa sus turnos: ${sinRotacion.join(', ')}.`,
    });

  const worked = (p: Plan, i: number) => !!p.A[i] && !esLibre(p.A[i]) && !p.special[i];
  const maxRun = (p: Plan) => {
    let run = p.prevTail;
    let max = run;
    for (let i = 0; i < daysInMonth; i++) {
      run = worked(p, i) ? run + 1 : 0;
      if (run > max) max = run;
    }
    return max;
  };
  const sundaysOff = (p: Plan) => {
    let off = 0;
    for (let i = 0; i < daysInMonth; i++) if (isSunday(i) && !worked(p, i)) off++;
    return off;
  };
  const sundaysOk = (p: Plan) => !p.sundayRule || sundaysOff(p) >= MIN_SUNDAYS_OFF;
  const sameWeek = (i: number) => {
    const start = i - dow(i + 1);
    const out: number[] = [];
    for (let j = Math.max(0, start); j <= Math.min(daysInMonth - 1, start + 6); j++) out.push(j);
    return out;
  };

  // Personas trabajando cada día
  const headcount = Array(daysInMonth).fill(0);
  const recount = () => {
    headcount.fill(0);
    plans.forEach((p) => {
      for (let i = 0; i < daysInMonth; i++) if (worked(p, i)) headcount[i]++;
    });
  };

  /** Pasa el libre del día `libre` al día `trabaja` (que toma el turno de `libre`), si queda bien */
  const swap = (p: Plan, trabaja: number, libre: number, check: () => boolean) => {
    const a = p.A[trabaja];
    const b = p.A[libre];
    p.A[trabaja] = b;
    p.A[libre] = a;
    if (maxRun(p) <= MAX_CONSECUTIVE_DAYS && check()) return true;
    p.A[trabaja] = a;
    p.A[libre] = b;
    return false;
  };

  // ── 1. Horas por semana: si se pasa, quedan libres los últimos días sugeridos ──
  plans.forEach((p) => {
    const limite = p.worker.horasContratadas ?? 42;
    for (let start = 0; start < daysInMonth; ) {
      const dias = sameWeek(start);
      const horas = () =>
        (dias[0] === 0 ? p.prevWeekHours : 0) +
        dias.reduce(
          (sum, j) => sum + (worked(p, j) ? shiftNetHours(shifts[p.A[j] as string]) : 0),
          0
        );
      for (let k = dias.length - 1; k >= 0 && Math.round(horas() * 10) / 10 > limite; k--) {
        const j = dias[k];
        if (p.editable[j] && worked(p, j)) p.A[j] = 'DESC';
      }
      start = dias[dias.length - 1] + 1;
    }
  });

  // ── 2. Máximo 6 días seguidos ──
  plans.forEach((p) => {
    for (let guard = 0; guard < 10 && maxRun(p) > MAX_CONSECUTIVE_DAYS; guard++) {
      let run = p.prevTail;
      let at = -1;
      for (let i = 0; i < daysInMonth; i++) {
        run = worked(p, i) ? run + 1 : 0;
        if (run > MAX_CONSECUTIVE_DAYS) {
          at = i;
          break;
        }
      }
      if (at < 0) break;
      // El último día que se puede cambiar dentro de la racha queda libre
      let cut = -1;
      for (let i = at; i >= Math.max(0, at - MAX_CONSECUTIVE_DAYS); i--)
        if (p.editable[i] && worked(p, i)) {
          cut = i;
          break;
        }
      if (cut < 0) break;
      const code = p.A[cut];
      p.A[cut] = 'DESC';
      // Si en la misma semana hay un libre sugerido, pasa a trabajar ese día (mismas horas)
      for (const j of sameWeek(cut)) {
        if (j === cut || !p.editable[j] || worked(p, j) || j < cut) continue;
        p.A[j] = code;
        if (maxRun(p) <= MAX_CONSECUTIVE_DAYS && sundaysOk(p)) break;
        p.A[j] = 'DESC';
      }
    }
  });

  // ── 3. Domingos libres ──
  recount();
  plans.forEach((p) => {
    if (!p.sundayRule) return;
    if (!p.A.some((_, i) => worked(p, i))) return;
    for (let guard = 0; guard < 6 && sundaysOff(p) < MIN_SUNDAYS_OFF; guard++) {
      const sundays = [];
      for (let i = 0; i < daysInMonth; i++)
        if (isSunday(i) && p.editable[i] && worked(p, i)) sundays.push(i);
      if (!sundays.length) break;
      // Primero los domingos que no son de mucha gente y donde más personas trabajan
      sundays.sort(
        (a, b) =>
          (peakDays.has(a) ? 1 : 0) - (peakDays.has(b) ? 1 : 0) || headcount[b] - headcount[a]
      );
      let done = false;
      for (const s of sundays) {
        const otros = sameWeek(s)
          .filter((j) => j !== s && p.editable[j] && !worked(p, j))
          .sort((a, b) => headcount[a] - headcount[b]);
        for (const j of otros) {
          if (swap(p, j, s, () => true)) {
            headcount[j]++;
            headcount[s]--;
            done = true;
            break;
          }
        }
        if (done) break;
      }
      if (!done) {
        // Sin otro día para compensar: el domingo queda libre igual (la regla va primero)
        const s = sundays[0];
        p.A[s] = 'DESC';
        headcount[s]--;
      }
    }
  });

  // ── 4. Días con más gente ──
  recount();
  const pocos: DiaConMasGenteResultado[] = [];
  [...peakDays.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([day, pedido]) => {
      if (headcount[day] < pedido) {
        // Quienes tienen libre sugerido ese día; primero los que trabajaron menos esa semana
        const candidatos = plans
          .filter((p) => p.editable[day] && !worked(p, day))
          .sort(
            (a, b) =>
              sameWeek(day).filter((j) => worked(a, j)).length -
              sameWeek(day).filter((j) => worked(b, j)).length
          );
        for (const p of candidatos) {
          if (headcount[day] >= pedido) break;
          const dias = sameWeek(day)
            .filter((j) => j !== day && p.editable[j] && worked(p, j) && !peakDays.has(j))
            .sort((a, b) => headcount[b] - headcount[a]);
          for (const j of dias) {
            if (swap(p, day, j, () => sundaysOk(p))) {
              headcount[day]++;
              headcount[j]--;
              break;
            }
          }
        }
      }
      pocos.push({ day: day + 1, pedido, quedan: headcount[day] });
    });

  // ── Resultado y revisión ──
  let casillas = 0;
  let cumplen = 0;
  const alertas: Aviso[] = [];
  plans.forEach((p) => {
    const out: Record<number, string> = {};
    p.A.forEach((c, i) => {
      if (p.editable[i] && c) {
        out[i] = esLibre(c) ? LIBRE : c;
        casillas++;
      }
    });
    propuesta[p.worker.id] = out;
    const ev = evaluateMonth({
      year,
      monthIdx,
      sched: p.A,
      special: p.special,
      prevSched: input.prevSched[p.worker.id],
      prevSpecial: input.prevSpecial[p.worker.id],
      shifts,
      weeklyHours: p.worker.horasContratadas ?? 42,
      exentoDomingos: p.worker.exentoDomingos,
    });
    if (ev.alerts.length === 0) cumplen++;
    else
      alertas.push({
        tipo: 'warn',
        workerId: p.worker.id,
        texto: `${p.worker.name}: ${ev.alerts[0].charAt(0).toLowerCase()}${ev.alerts[0].slice(1)}.`,
      });
  });

  const resumen: Aviso[] = [];
  if (plans.length)
    resumen.push({
      tipo: cumplen === plans.length ? 'ok' : 'info',
      texto: `${cumplen} de ${plans.length} cumplen todo: horas, días seguidos y domingos libres.`,
    });
  pocos
    .filter((g) => g.quedan < g.pedido)
    .forEach((g) =>
      resumen.push({
        tipo: 'warn',
        texto: `Día ${g.day}: quedaron ${g.quedan} personas y pediste ${g.pedido}. No hubo más gente para mover sin pasar de 6 días seguidos, quitar domingos libres o tocar libres aprobados.`,
      })
    );
  (input.holidays ?? [])
    .filter((i) => plans.some((p) => p.editable[i] && worked(p, i)))
    .forEach((i) =>
      resumen.push({
        tipo: 'info',
        texto: `${i + 1} de ${mes} es feriado: se llenó como un día normal. Revisa si abren.`,
      })
    );

  return {
    propuesta,
    casillas,
    cumplen,
    conPropuesta: plans.length,
    diasConMasGente: pocos,
    avisos: [...resumen, ...alertas, ...avisos],
  };
}

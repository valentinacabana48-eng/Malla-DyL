'use client';
import React, { useMemo, useState } from 'react';
import { X, Stethoscope, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAppContext, addDaysISO, type Worker } from '@/context/AppContext';

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES = [
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
export const MESES_CAP = MES.map((m) => m[0].toUpperCase() + m.slice(1));

/** "2026-10-24" → "viernes 24 de octubre" */
export function fechaLarga(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${d} de ${MES[m - 1]}`;
}

/** Fecha de hoy en el equipo, "YYYY-MM-DD" */
export function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

interface Props {
  workers: Worker[];
  isLocked: boolean;
  onClose: () => void;
}

export default function LicenciaModal({ workers, isLocked, onClose }: Props) {
  const { licencias, registrarLicencia, quitarLicencia, scheduleData, shifts } = useAppContext();
  const sorted = useMemo(
    () => [...workers].sort((a, b) => a.name.localeCompare(b.name)),
    [workers]
  );
  const [workerId, setWorkerId] = useState('');
  const [desde, setDesde] = useState(hoyISO());
  const [dias, setDias] = useState('');
  const [saving, setSaving] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);

  const n = Math.floor(Number(dias));
  const validDias = n >= 1 && n <= 366;
  const hasta = validDias && desde ? addDaysISO(desde, n - 1) : '';
  const vuelve = validDias && desde ? addDaysISO(desde, n) : '';

  // Turnos que tenía programados en esos días (se guardan, no se pierden)
  const turnosProgramados = useMemo(() => {
    if (!workerId || !validDias || !desde) return 0;
    let count = 0;
    for (let i = 0; i < n; i++) {
      const d = addDaysISO(desde, i);
      const sh = ((scheduleData[d.slice(0, 7)] || {})[workerId] || [])[Number(d.slice(8)) - 1];
      if (sh && shifts[sh]?.start) count++;
    }
    return count;
  }, [workerId, validDias, desde, n, scheduleData, shifts]);

  const overlap =
    workerId && hasta
      ? licencias.find((l) => l.workerId === workerId && l.desde <= hasta && desde <= l.hasta)
      : undefined;

  const workerIds = new Set(workers.map((w) => w.id));
  const nameOf = (id: string) => workers.find((w) => w.id === id)?.name ?? '';
  const hoy = hoyISO();
  const visibles = licencias
    .filter((l) => workerIds.has(l.workerId) && l.hasta >= addDaysISO(hoy, -30))
    .sort((a, b) => a.desde.localeCompare(b.desde));

  const canSubmit = !isLocked && !saving && !!workerId && validDias && !!desde && !overlap;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    const ok = await registrarLicencia(workerId, desde, n);
    setSaving(false);
    if (ok) {
      toast.success(`Licencia registrada: ${nameOf(workerId)}, vuelve el ${fechaLarga(vuelve)}`);
      setWorkerId('');
      setDias('');
    }
  };

  const quitar = async (id: string) => {
    if (isLocked) return;
    if (!window.confirm('¿Quitar esta licencia? Se devuelven los turnos que tenía esos días.'))
      return;
    setQuitando(id);
    const ok = await quitarLicencia(id);
    setQuitando(null);
    if (ok) toast.success('Licencia quitada. Los turnos volvieron a la malla.');
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Stethoscope size={16} className="text-yellow-700" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Registrar licencia</h2>
              <p className="text-xs text-muted-foreground">
                Los turnos que tenía quedan guardados debajo de la licencia
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X size={16} className="text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Persona</span>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="h-11 px-3 rounded-xl border border-border bg-background text-sm"
            >
              <option value="">Elige a la persona…</option>
              {sorted.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Desde</span>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="h-11 px-3 rounded-xl border border-border bg-background text-sm"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Días de licencia</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={366}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                placeholder="Ej: 7"
                className="h-11 px-3 rounded-xl border border-border bg-background text-sm"
              />
            </label>
          </div>

          {hasta && (
            <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-900 space-y-1">
              <p>
                Último día de licencia: <strong>{fechaLarga(hasta)}</strong>
              </p>
              <p>
                Vuelve el <strong>{fechaLarga(vuelve)}</strong>
              </p>
              {workerId && (
                <p className="text-xs text-yellow-800">
                  {turnosProgramados === 0
                    ? 'No tenía turnos programados en esos días.'
                    : `Tenía ${turnosProgramados} turno(s) programado(s); quedan guardados y se ven en la malla.`}
                </p>
              )}
              <p className="text-xs text-yellow-800">
                Se cuentan días corridos (incluye descansos).
              </p>
            </div>
          )}

          {overlap && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              Ya tiene una licencia del {fechaLarga(overlap.desde)} al {fechaLarga(overlap.hasta)}.
              Quítala primero si quieres cambiarla.
            </p>
          )}
          {isLocked && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              La malla está bloqueada. Desbloquéala para registrar licencias.
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full h-11 rounded-xl bg-yellow-500 text-yellow-950 text-sm font-bold hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando…' : 'Registrar licencia'}
          </button>

          {visibles.length > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Licencias registradas
              </p>
              <ul className="space-y-2">
                {visibles.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{nameOf(l.workerId)}</p>
                      <p className="text-xs text-muted-foreground">
                        {fechaLarga(l.desde)} al {fechaLarga(l.hasta)} · {l.dias} día(s) · vuelve el{' '}
                        {fechaLarga(addDaysISO(l.hasta, 1))}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => quitar(l.id)}
                      disabled={isLocked || quitando === l.id}
                      title="Quitar licencia y devolver sus turnos"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Aviso en la Malla cuando alguien vuelve de licencia (desde el último día hasta que se elige) */
export function LicenciaAvisos({
  workers,
  onTurnosNuevos,
}: {
  workers: Worker[];
  onTurnosNuevos: (workerId: string, vuelve: string) => void;
}) {
  const { licencias, resolverAvisoLicencia } = useAppContext();
  const hoy = hoyISO();
  const pendientes = licencias.filter(
    (l) => !l.avisoResuelto && l.hasta <= hoy && workers.some((w) => w.id === l.workerId)
  );
  if (pendientes.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {pendientes.map((l) => {
        const w = workers.find((x) => x.id === l.workerId)!;
        const vuelve = addDaysISO(l.hasta, 1);
        const yaVolvio = vuelve <= hoy;
        return (
          <div
            key={l.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-xl px-4 py-3 text-sm"
          >
            <span className="flex-1">
              🏥 <strong>{w.name}</strong> {yaVolvio ? 'volvió' : 'vuelve'} de licencia el{' '}
              <strong>{fechaLarga(vuelve)}</strong>. ¿Qué hacemos con sus turnos?
            </span>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => resolverAvisoLicencia(l.id)}
                className="h-9 px-3 rounded-lg border border-yellow-400 bg-white text-xs font-bold hover:bg-yellow-100"
              >
                Sigue con la misma malla
              </button>
              <button
                type="button"
                onClick={() => {
                  resolverAvisoLicencia(l.id);
                  onTurnosNuevos(l.workerId, vuelve);
                }}
                className="h-9 px-3 rounded-lg bg-yellow-500 text-yellow-950 text-xs font-bold hover:bg-yellow-400"
              >
                Hacer turnos nuevos
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

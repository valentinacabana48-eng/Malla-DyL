'use client';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Send, Shuffle } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { misTurnosUrl, whatsappLink } from '@/lib/misTurnos';
import { useAppContext, type Worker } from '@/context/AppContext';

/** 4 números al azar, sin claves fáciles de adivinar (1111, 1234, 4321) */
export function inventarClave(): string {
  for (;;) {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    const pin = String(n[0] % 10000).padStart(4, '0');
    const d = pin.split('').map(Number);
    const iguales = d.every((x) => x === d[0]);
    const sube = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
    const baja = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
    if (!iguales && !sube && !baja) return pin;
  }
}

type Status = 'cargando' | 'sin-clave' | 'con-clave' | 'bloqueada' | 'error';

/** Clave de la trabajadora para entrar a "Mis turnos" (se guarda cifrada; solo se puede cambiar). */
export default function WorkerPinSection({ worker }: { worker: Worker }) {
  const [status, setStatus] = useState<Status>('cargando');
  const [pin, setPin] = useState('');
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { workers, motivoSinMisTurnos, setWorkerMisTurnosExcepcion } = useAppContext();
  const sinAcceso = motivoSinMisTurnos(worker);
  const excepcion = !!(workers.find((w) => w.id === worker.id) ?? worker).misTurnosExcepcion;
  const [savingExcepcion, setSavingExcepcion] = useState(false);

  const toggleExcepcion = async () => {
    setSavingExcepcion(true);
    const ok = await setWorkerMisTurnosExcepcion(worker.id, !excepcion);
    setSavingExcepcion(false);
    if (ok) toast.success(excepcion ? 'Acceso quitado' : 'Acceso dado');
  };

  useEffect(() => {
    let cancel = false;
    setStatus('cargando');
    setPin('');
    setSavedPin(null);
    // Clave legible (solo las creadas o cambiadas desde que se guardan visibles)
    getSupabase()
      .rpc('worker_pin_visible', { p_worker_ids: [worker.id] })
      .then(({ data, error }) => {
        if (cancel || error) return;
        const row = (data as { r_pin: string | null }[] | null)?.[0];
        if (row?.r_pin) setSavedPin(row.r_pin);
      });
    getSupabase()
      .rpc('worker_pin_status', { p_worker_ids: [worker.id] })
      .then(({ data, error }) => {
        if (cancel) return;
        if (error) {
          console.error('Error al revisar la clave:', error);
          setStatus('error');
          return;
        }
        const row = (data as { r_locked_until: string | null }[] | null)?.[0];
        if (!row) setStatus('sin-clave');
        else if (row.r_locked_until && new Date(row.r_locked_until) > new Date())
          setStatus('bloqueada');
        else setStatus('con-clave');
      });
    return () => {
      cancel = true;
    };
  }, [worker.id]);

  const valid = /^\d{4,6}$/.test(pin);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const { error } = await getSupabase().rpc('set_worker_pin', {
      p_worker_id: worker.id,
      p_pin: pin,
    });
    setSaving(false);
    if (error) {
      console.error('Error al guardar la clave:', error);
      toast.error('No se pudo guardar la clave. Revisa tu conexión e intenta de nuevo.');
      return;
    }
    setSavedPin(pin);
    setStatus('con-clave');
    toast.success('Clave guardada');
  };

  const remove = async () => {
    if (!window.confirm(`¿Quitar la clave de ${worker.name}? Ya no podrá entrar a Mis turnos.`))
      return;
    const { error } = await getSupabase().rpc('set_worker_pin', {
      p_worker_id: worker.id,
      p_pin: null,
    });
    if (error) {
      toast.error('No se pudo quitar la clave.');
      return;
    }
    setSavedPin(null);
    setPin('');
    setStatus('sin-clave');
    toast.success('Clave quitada');
  };

  const nombre = worker.name.trim().split(/\s+/)[0] || worker.name;
  const mensaje = savedPin
    ? `Hola ${nombre}, revisa tus turnos en ${misTurnosUrl()} con tu RUT (${worker.rut}) y la clave ${savedPin}.`
    : '';

  return (
    <section className="mx-5 mb-5 rounded-xl border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <KeyRound size={18} className="text-secondary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-bold text-foreground">Clave para «Mis turnos»</span>
          <span
            className={`text-xs font-semibold ${
              status === 'con-clave'
                ? 'text-green-700'
                : status === 'bloqueada'
                  ? 'text-red-600'
                  : 'text-muted-foreground'
            }`}
          >
            {status === 'cargando'
              ? 'Revisando…'
              : status === 'con-clave'
                ? '✓ Ya tiene clave'
                : status === 'bloqueada'
                  ? 'Bloqueada 15 min por intentos fallidos (al guardar una clave nueva se desbloquea)'
                  : status === 'error'
                    ? 'No se pudo revisar la clave'
                    : 'Todavía no tiene clave'}
          </span>
        </div>
      </div>

      {sinAcceso && (
        <div
          className={`rounded-lg border px-3 py-2 flex flex-col gap-2 ${
            excepcion ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'
          }`}
        >
          <span
            className={`text-xs font-semibold ${excepcion ? 'text-green-800' : 'text-amber-800'}`}
          >
            {excepcion
              ? `${sinAcceso}, pero ella sí puede entrar (excepción).`
              : `${sinAcceso}: aunque tenga clave, no puede entrar.`}
          </span>
          <label className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <input
              type="checkbox"
              checked={excepcion}
              disabled={savingExcepcion}
              onChange={toggleExcepcion}
              className="w-4 h-4"
            />
            Darle acceso igual
          </label>
        </div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold text-foreground">
          {status === 'sin-clave' ? 'Clave' : 'Nueva clave'} (4 a 6 números)
        </span>
        <input
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-lg font-bold tracking-[4px] focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPin(inventarClave())}
          className="flex items-center justify-center gap-1.5 h-11 rounded-lg border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted"
        >
          <Shuffle size={15} />
          Inventar una
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="h-11 rounded-lg bg-secondary text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Guardar clave'}
        </button>
      </div>

      {savedPin && (
        <>
          <p className="text-sm text-foreground">
            Clave actual:{' '}
            <span className="font-mono text-lg font-bold tracking-widest">{savedPin}</span>
          </p>
          <a
            href={whatsappLink(mensaje)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 h-12 rounded-lg bg-green-600 text-white text-sm font-bold hover:bg-green-700"
          >
            <Send size={16} />
            Enviar por WhatsApp
          </a>
          <p className="text-xs text-foreground bg-muted/40 border border-dashed border-border rounded-lg px-3 py-2">
            «{mensaje}»
          </p>
        </>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Solo quien edita Personal puede ver la clave. Las claves puestas antes del 30-10 están solo
        cifradas: no se pueden ver, solo cambiar. Tras 5 intentos fallidos, la cuenta se bloquea 15
        minutos.
        {status === 'con-clave' && (
          <>
            {' '}
            <button type="button" onClick={remove} className="underline hover:text-red-600">
              Quitar clave
            </button>
          </>
        )}
      </p>
    </section>
  );
}

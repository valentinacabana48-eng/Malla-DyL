'use client';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, Printer, Send, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase/client';
import { printElement } from '@/lib/printElement';
import { misTurnosUrl, whatsappLink } from '@/lib/misTurnos';
import { useAppContext, type Worker } from '@/context/AppContext';
import { inventarClave } from './WorkerPinSection';

interface Creada {
  worker: Worker;
  pin: string;
}

/**
 * Crea de una vez la clave de «Mis turnos» de las trabajadoras de la lista que se ve
 * (activas, con RUT, con acceso y sin clave). Cada una viene con una clave al azar que se
 * puede cambiar; en blanco no se le crea. Las claves se ven solo aquí, al crearlas.
 */
export default function BulkPinPanel({
  workers,
  alcance,
  onClose,
}: {
  workers: Worker[];
  /** Filtros de Personal que arman la lista, en palabras ("Sucursal: Centro · Área: Cajas") */
  alcance: string;
  onClose: () => void;
}) {
  const { motivoSinMisTurnos } = useAppContext();
  const [conClave, setConClave] = useState<Set<string> | null>(null);
  const [error, setError] = useState(false);
  const [creando, setCreando] = useState(false);
  const [avance, setAvance] = useState(0);
  const [creadas, setCreadas] = useState<Creada[]>([]);
  const [claves, setClaves] = useState<Record<string, string>>({});
  const listaRef = useRef<HTMLDivElement>(null);

  const conAcceso = (w: Worker) => !motivoSinMisTurnos(w) || !!w.misTurnosExcepcion;
  const posibles = workers.filter((w) => w.estado === 'Activo' && w.rut.trim() && conAcceso(w));
  const pendientes = conClave ? posibles.filter((w) => !conClave.has(w.id)) : [];
  const aCrear = pendientes.filter((w) => (claves[w.id] ?? '') !== '');
  const malas = aCrear.filter((w) => !/^\d{4,6}$/.test(claves[w.id]));

  useEffect(() => {
    let cancel = false;
    getSupabase()
      .rpc('worker_pin_status', { p_worker_ids: posibles.map((w) => w.id) })
      .then(({ data, error: err }) => {
        if (cancel) return;
        if (err) {
          console.error('Error al revisar las claves:', err);
          setError(true);
          return;
        }
        const ya = new Set(((data as { r_worker_id: string }[]) ?? []).map((r) => r.r_worker_id));
        setConClave(ya);
        // Una clave al azar para cada una; se puede cambiar antes de crear
        setClaves(
          Object.fromEntries(
            posibles.filter((w) => !ya.has(w.id)).map((w) => [w.id, inventarClave()])
          )
        );
      });
    return () => {
      cancel = true;
    };
    // Se revisa una vez al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const crear = async () => {
    setCreando(true);
    setAvance(0);
    const hechas: Creada[] = [];
    let fallas = 0;
    // De a una: así una falla no deja a las demás sin clave
    for (const w of aCrear) {
      const pin = claves[w.id];
      const { error: err } = await getSupabase().rpc('set_worker_pin', {
        p_worker_id: w.id,
        p_pin: pin,
      });
      if (err) {
        console.error('Error al guardar la clave de', w.name, err);
        fallas++;
      } else hechas.push({ worker: w, pin });
      setAvance((n) => n + 1);
    }
    setCreando(false);
    setCreadas(hechas);
    setConClave((prev) => new Set([...(prev ?? []), ...hechas.map((h) => h.worker.id)]));
    if (fallas) toast.error(`${fallas} clave(s) no se pudieron crear. Intenta de nuevo.`);
    else toast.success(`${hechas.length} clave(s) creadas`);
  };

  const mensaje = ({ worker, pin }: Creada) => {
    const nombre = worker.name.trim().split(/\s+/)[0] || worker.name;
    return `Hola ${nombre}, revisa tus turnos en ${misTurnosUrl()} con tu RUT (${worker.rut}) y la clave ${pin}.`;
  };

  const cerrar = () => {
    if (
      creadas.length &&
      !window.confirm('Las claves no se vuelven a ver. ¿Ya las imprimiste o enviaste?')
    )
      return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center bg-black/50 lg:p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full lg:max-w-2xl max-h-[92vh] flex flex-col rounded-t-2xl lg:rounded-2xl bg-card border border-border shadow-xl"
      >
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <KeyRound size={18} className="text-secondary" />
          <h2 className="flex-1 text-base font-bold text-foreground">Claves de «Mis turnos»</h2>
          <button
            type="button"
            onClick={cerrar}
            aria-label="Cerrar"
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {creadas.length === 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Se crea una clave para cada trabajadora de la lista que estás viendo que todavía no
                tiene. Para elegir sucursal, área o cargo, usa los filtros de Personal antes de
                abrir esto. Cada una trae una clave al azar: puedes escribir otra (4 a 6 números) o
                dejarla en blanco para no crearle clave.
              </p>
              <p className="text-sm font-semibold text-foreground bg-muted rounded-xl px-3 py-2">
                {alcance}
              </p>
              {error ? (
                <p className="text-sm font-semibold text-red-600">
                  No se pudieron revisar las claves. Revisa tu conexión e intenta de nuevo.
                </p>
              ) : !conClave ? (
                <p className="text-sm text-muted-foreground">Revisando…</p>
              ) : (
                <ul className="text-sm text-foreground flex flex-col gap-1">
                  <li>
                    <strong>{pendientes.length}</strong> sin clave
                  </li>
                  <li className="text-muted-foreground">
                    {posibles.length - pendientes.length} ya tienen clave (no se cambian)
                  </li>
                  {workers.length > posibles.length && (
                    <li className="text-muted-foreground">
                      {workers.length - posibles.length} quedan fuera: inactivas, sin RUT o sin
                      acceso a Mis turnos
                    </li>
                  )}
                </ul>
              )}
              {conClave && pendientes.length > 0 && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-semibold">Nombre</th>
                      <th className="py-2 pr-3 font-semibold hidden sm:table-cell">Cargo</th>
                      <th className="py-2 font-semibold w-28">Clave</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((w) => {
                      const valor = claves[w.id] ?? '';
                      const mala = valor !== '' && !/^\d{4,6}$/.test(valor);
                      return (
                        <tr key={w.id} className="border-b border-border/60">
                          <td className="py-1.5 pr-3 text-foreground">
                            {w.name}
                            <span className="block text-xs text-muted-foreground sm:hidden">
                              {w.cargo}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-muted-foreground hidden sm:table-cell">
                            {w.cargo}
                          </td>
                          <td className="py-1.5">
                            <input
                              value={valor}
                              onChange={(e) =>
                                setClaves((prev) => ({
                                  ...prev,
                                  [w.id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                                }))
                              }
                              disabled={creando}
                              inputMode="numeric"
                              autoComplete="off"
                              placeholder="sin clave"
                              aria-label={`Clave de ${w.name}`}
                              className={`w-28 min-h-[40px] rounded-lg border bg-background px-2 font-mono text-base tracking-widest ${
                                mala ? 'border-red-400' : 'border-border'
                              }`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {malas.length > 0 && (
                <p className="text-sm font-semibold text-red-600">
                  {malas.length} clave(s) con menos de 4 números. Complétalas o déjalas en blanco.
                </p>
              )}
              {creando && (
                <p className="text-sm font-semibold text-secondary">
                  Creando {avance} de {aCrear.length}…
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                Estas claves se ven solo ahora. Imprímelas o envíalas antes de cerrar.
              </p>
              <div ref={listaRef}>
                <h3 className="text-base font-bold text-foreground mb-1">Claves de «Mis turnos»</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Entra en {misTurnosUrl()} con tu RUT y tu clave.
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-2 pr-3 font-semibold">Nombre</th>
                      <th className="py-2 pr-3 font-semibold">RUT</th>
                      <th className="py-2 pr-3 font-semibold">Clave</th>
                      <th className="py-2 print:hidden" />
                    </tr>
                  </thead>
                  <tbody>
                    {creadas.map((c) => (
                      <tr key={c.worker.id} className="border-b border-border/60">
                        <td className="py-2 pr-3 text-foreground">{c.worker.name}</td>
                        <td className="py-2 pr-3 font-mono text-foreground">{c.worker.rut}</td>
                        <td className="py-2 pr-3 font-mono text-lg font-bold tracking-widest text-foreground">
                          {c.pin}
                        </td>
                        <td className="py-2 text-right print:hidden">
                          <a
                            href={whatsappLink(mensaje(c))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100"
                          >
                            <Send size={13} />
                            WhatsApp
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          {creadas.length === 0 ? (
            <button
              type="button"
              disabled={!conClave || aCrear.length === 0 || malas.length > 0 || creando}
              onClick={crear}
              className="min-h-[44px] px-5 rounded-xl bg-secondary text-white text-sm font-semibold disabled:opacity-40"
            >
              {creando ? 'Creando…' : `Crear ${aCrear.length} clave(s)`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                listaRef.current && printElement(listaRef.current, { title: 'Claves Mis turnos' })
              }
              className="min-h-[44px] px-5 rounded-xl bg-secondary text-white text-sm font-semibold flex items-center gap-2"
            >
              <Printer size={16} />
              Imprimir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

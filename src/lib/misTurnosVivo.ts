'use client';
import { useEffect, useRef, useState } from 'react';
import { getPublicSupabase } from '@/lib/supabase/publicClient';

// ─── Mis turnos en vivo ──────────────────────────────────────────────────────
// La trabajadora no tiene cuenta de Supabase, así que no puede escuchar las tablas.
// En cambio pide su canal propio (una clave al azar) y la base de datos avisa por ahí
// cuando cambia su malla publicada o una solicitud. El aviso no trae datos: solo
// dispara una recarga normal con su sesión.

/** Evento de ventana para que otras partes de la pantalla (p. ej. Solicitudes) se recarguen */
export const EVENTO_CAMBIO = 'dyl:mis-turnos-cambio';

/** Llama a onCambio cuando hay algo nuevo para esta trabajadora. */
export function useMisTurnosEnVivo(token: string | null, onCambio: () => void) {
  const cb = useRef(onCambio);
  cb.current = onCambio;

  useEffect(() => {
    if (!token) return;
    const supabase = getPublicSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cerrado = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let conectadoAntes = false;

    // Al publicar llegan varios avisos seguidos: se recarga una sola vez
    const avisar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        cb.current();
        window.dispatchEvent(new Event(EVENTO_CAMBIO));
      }, 600);
    };

    (async () => {
      try {
        const { data: topic } = await supabase.rpc('mis_turnos_canal', { p_token: token });
        if (cerrado || typeof topic !== 'string' || !topic) return;
        channel = supabase
          .channel(topic)
          .on('broadcast', { event: 'cambio' }, avisar)
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              // Si se cortó la conexión (celular dormido, sin señal), al volver se revisa
              if (conectadoAntes) avisar();
              conectadoAntes = true;
            }
          });
      } catch (err) {
        console.warn('Mis turnos en vivo:', err);
      }
    })();

    // El aviso al celular también avisa a la app si está abierta
    const onSwMessage = (e: MessageEvent) => {
      if (e.data?.tipo === 'mis-turnos-cambio') avisar();
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    // Por si acaso: revisa cada 5 minutos mientras la app está a la vista
    const intervalo = setInterval(
      () => {
        if (document.visibilityState === 'visible') cb.current();
      },
      5 * 60 * 1000
    );

    return () => {
      cerrado = true;
      clearTimeout(timer);
      clearInterval(intervalo);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      if (channel) supabase.removeChannel(channel);
    };
  }, [token]);
}

// ─── Avisos al celular (web push) ────────────────────────────────────────────

export type EstadoAvisos =
  | 'cargando'
  | 'no-disponible' // el navegador no permite avisos
  | 'instalar-ios' // iPhone: solo con la app instalada en la pantalla de inicio
  | 'bloqueado' // la trabajadora dijo que no (se cambia en los ajustes del celular)
  | 'apagado'
  | 'activo';

function esIosSinInstalar(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPhone|iPad|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

function soportado(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!soportado()) return null;
  // En producción lo registra PwaSetup; aquí se asegura por si aún no termina
  const reg =
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.register('/sw.js'));
  return reg ? navigator.serviceWorker.ready : null;
}

async function guardar(token: string, sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  const { data, error } = await getPublicSupabase().rpc('mis_turnos_push_guardar', {
    p_token: token,
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
  });
  return !error && data === true;
}

export function useAvisosCelular(token: string | null) {
  const [estado, setEstado] = useState<EstadoAvisos>('cargando');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let vivo = true;
    (async () => {
      if (!soportado()) {
        setEstado(esIosSinInstalar() ? 'instalar-ios' : 'no-disponible');
        return;
      }
      if (esIosSinInstalar()) {
        setEstado('instalar-ios');
        return;
      }
      if (Notification.permission === 'denied') {
        setEstado('bloqueado');
        return;
      }
      try {
        const reg = await registro();
        const sub = await reg?.pushManager.getSubscription();
        if (!vivo) return;
        if (sub && Notification.permission === 'granted') {
          // Se vuelve a guardar por si entró otra trabajadora en este celular
          await guardar(token, sub);
          if (vivo) setEstado('activo');
        } else {
          setEstado('apagado');
        }
      } catch {
        if (vivo) setEstado('apagado');
      }
    })();
    return () => {
      vivo = false;
    };
  }, [token]);

  const activar = async () => {
    if (!token) return;
    setError('');
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        setEstado(permiso === 'denied' ? 'bloqueado' : 'apagado');
        return;
      }
      const { data: clave } = await getPublicSupabase().rpc('mis_turnos_push_clave');
      if (typeof clave !== 'string' || !clave) throw new Error('sin clave');
      const reg = await registro();
      if (!reg) throw new Error('sin service worker');
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToBytes(clave) as BufferSource,
        }));
      if (!(await guardar(token, sub))) throw new Error('no se guardó');
      setEstado('activo');
    } catch (err) {
      console.error('Avisos:', err);
      setError('No se pudieron activar los avisos. Intenta de nuevo.');
    }
  };

  const desactivar = async () => {
    if (!token) return;
    try {
      const reg = await registro();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await getPublicSupabase().rpc('mis_turnos_push_borrar', {
          p_token: token,
          p_endpoint: sub.endpoint,
        });
        await sub.unsubscribe();
      }
    } catch {
      // si falla, igual queda apagado en este celular
    }
    setEstado('apagado');
  };

  return { estado, error, activar, desactivar };
}

/** Al salir de Mis turnos este celular deja de recibir los avisos de esa trabajadora. */
export async function apagarAvisosAlSalir(token: string) {
  try {
    if (!soportado()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await getPublicSupabase().rpc('mis_turnos_push_borrar', {
      p_token: token,
      p_endpoint: sub.endpoint,
    });
    await sub.unsubscribe();
  } catch {
    // no es crítico
  }
}

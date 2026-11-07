// Función «enviar-avisos»: manda al celular los avisos que quedaron en la cola (push_queue).
// La llama la base de datos (pg_net) cuando se publica un turno. No recibe datos: solo
// revisa la cola, así que no importa quién la llame.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

interface Aviso {
  id: number;
  worker_id: string;
  title: string;
  body: string;
  url: string;
}

interface Sub {
  endpoint: string;
  worker_id: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async () => {
  try {
    const { data: cfg, error: cfgError } = await supabase
      .from('push_config')
      .select('vapid_public, vapid_private, vapid_subject')
      .eq('id', 1)
      .single();
    if (cfgError || !cfg) throw cfgError ?? new Error('Falta push_config');
    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

    // Se toman los pendientes de una vez (si llegan dos llamadas, cada aviso sale una sola vez)
    const { data: avisos, error: qError } = await supabase
      .from('push_queue')
      .update({ sent_at: new Date().toISOString() })
      .is('sent_at', null)
      .select('id, worker_id, title, body, url');
    if (qError) throw qError;
    if (!avisos?.length) return Response.json({ enviados: 0 });

    const workerIds = [...new Set((avisos as Aviso[]).map((a) => a.worker_id))];
    const { data: subs, error: sError } = await supabase
      .from('push_subscriptions')
      .select('endpoint, worker_id, p256dh, auth')
      .in('worker_id', workerIds);
    if (sError) throw sError;

    // Varios avisos para la misma trabajadora en una publicación: se juntan en uno
    const porTrabajadora = new Map<string, Aviso[]>();
    for (const a of avisos as Aviso[]) {
      porTrabajadora.set(a.worker_id, [...(porTrabajadora.get(a.worker_id) ?? []), a]);
    }

    let enviados = 0;
    const vencidas: string[] = [];
    const okEndpoints: string[] = [];
    const resultado = new Map<number, string>();

    await Promise.all(
      [...porTrabajadora.entries()].map(async ([wid, lista]) => {
        const misSubs = (subs as Sub[]).filter((s) => s.worker_id === wid);
        const body = lista.length === 1 ? lista[0].body : lista.map((a) => a.body).join('\n');
        const payload = JSON.stringify({
          title: lista[0].title,
          body,
          url: lista[0].url,
          tag: 'mis-turnos',
        });
        const res: string[] = [];
        for (const s of misSubs) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload,
              { TTL: 60 * 60 * 24 * 3, urgency: 'high' }
            );
            enviados++;
            okEndpoints.push(s.endpoint);
            res.push('ok');
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            // 404/410: el celular ya no acepta avisos (desinstaló o quitó el permiso)
            if (code === 404 || code === 410) vencidas.push(s.endpoint);
            res.push(`error ${code ?? (err as Error).message}`);
          }
        }
        const txt = misSubs.length ? res.join(', ') : 'sin celular';
        for (const a of lista) resultado.set(a.id, txt);
      })
    );

    if (vencidas.length) await supabase.from('push_subscriptions').delete().in('endpoint', vencidas);
    if (okEndpoints.length) {
      await supabase
        .from('push_subscriptions')
        .update({ last_ok_at: new Date().toISOString() })
        .in('endpoint', okEndpoints);
    }
    await Promise.all(
      [...resultado.entries()].map(([id, result]) =>
        supabase.from('push_queue').update({ result: result.slice(0, 500) }).eq('id', id)
      )
    );
    // La cola se limpia sola: se borran los avisos de hace más de 60 días
    await supabase
      .from('push_queue')
      .delete()
      .lt('created_at', new Date(Date.now() - 60 * 864e5).toISOString());

    return Response.json({ enviados });
  } catch (err) {
    console.error('enviar-avisos:', err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
});

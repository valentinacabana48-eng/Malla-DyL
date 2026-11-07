-- ─── Mis turnos en vivo y avisos al celular ───────────────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--
-- Qué hace:
--   • En vivo: cada trabajadora tiene un canal propio (una clave al azar). Cuando cambia
--     su malla publicada o una de sus solicitudes, la base de datos avisa por ese canal y
--     Mis turnos se recarga sola. El aviso no lleva datos: la app los vuelve a pedir con
--     su sesión, como siempre.
--   • Avisos al celular: la trabajadora activa los avisos en Mis turnos. Cuando se le
--     publica un turno (o le cambia uno ya publicado) se deja el aviso en una cola y la
--     función «enviar-avisos» lo manda al celular.
--   • Las claves del envío (VAPID) se guardan en push_config, que nadie puede leer desde
--     la app. Se cargan una sola vez aparte (no van en este archivo).
-- No borra datos. Se puede volver a ejecutar sin error.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Canal en vivo de cada trabajadora ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_live_keys (
  worker_id TEXT PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  canal TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex')
);
ALTER TABLE public.worker_live_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.worker_live_keys FROM anon, authenticated;

-- La app de la trabajadora pide su canal con su sesión
CREATE OR REPLACE FUNCTION public.mis_turnos_canal(p_token TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_canal TEXT;
BEGIN
  IF v_wid IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.worker_live_keys (worker_id) VALUES (v_wid) ON CONFLICT DO NOTHING;
  SELECT canal INTO v_canal FROM public.worker_live_keys WHERE worker_id = v_wid;
  RETURN 'mis-turnos-' || v_canal;
END $$;
REVOKE EXECUTE ON FUNCTION public.mis_turnos_canal(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_turnos_canal(TEXT) TO anon, authenticated;

-- Avisa por el canal de la trabajadora (si alguna vez abrió Mis turnos)
CREATE OR REPLACE FUNCTION public.mis_turnos_ping(p_worker_id TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_canal TEXT;
BEGIN
  IF p_worker_id IS NULL THEN RETURN; END IF;
  SELECT canal INTO v_canal FROM public.worker_live_keys WHERE worker_id = p_worker_id;
  IF v_canal IS NULL THEN RETURN; END IF;
  BEGIN
    PERFORM realtime.send('{}'::jsonb, 'cambio', 'mis-turnos-' || v_canal, false);
  EXCEPTION WHEN OTHERS THEN
    -- Un aviso que no sale nunca debe impedir publicar
    RAISE WARNING 'mis_turnos_ping: %', SQLERRM;
  END;
END $$;
REVOKE EXECUTE ON FUNCTION public.mis_turnos_ping(TEXT) FROM PUBLIC, anon, authenticated;

-- ── Avisos al celular ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  vapid_public TEXT NOT NULL,
  vapid_private TEXT NOT NULL,
  vapid_subject TEXT NOT NULL DEFAULT 'mailto:avisos@dyl.cl',
  function_url TEXT NOT NULL
);
ALTER TABLE public.push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_config FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_subscriptions_worker ON public.push_subscriptions (worker_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.push_queue (
  id BIGSERIAL PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '/mis-turnos',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  result TEXT
);
CREATE INDEX IF NOT EXISTS push_queue_pending ON public.push_queue (id) WHERE sent_at IS NULL;
ALTER TABLE public.push_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_queue FROM anon, authenticated;

-- Clave pública para activar los avisos (es pública por diseño)
CREATE OR REPLACE FUNCTION public.mis_turnos_push_clave()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT vapid_public FROM public.push_config WHERE id = 1 $$;
REVOKE EXECUTE ON FUNCTION public.mis_turnos_push_clave() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_turnos_push_clave() TO anon, authenticated;

-- Guarda este celular para recibir avisos (si era de otra trabajadora, pasa a esta)
CREATE OR REPLACE FUNCTION public.mis_turnos_push_guardar(
  p_token TEXT, p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
BEGIN
  IF v_wid IS NULL OR p_endpoint !~ '^https://' OR length(p_endpoint) > 1000
     OR COALESCE(p_p256dh, '') = '' OR COALESCE(p_auth, '') = '' THEN
    RETURN false;
  END IF;
  INSERT INTO public.push_subscriptions (endpoint, worker_id, p256dh, auth)
  VALUES (p_endpoint, v_wid, p_p256dh, p_auth)
  ON CONFLICT (endpoint) DO UPDATE
    SET worker_id = EXCLUDED.worker_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth;
  -- Máximo 5 celulares por trabajadora: se olvidan los más antiguos
  DELETE FROM public.push_subscriptions s
  WHERE s.worker_id = v_wid AND s.endpoint NOT IN (
    SELECT endpoint FROM public.push_subscriptions WHERE worker_id = v_wid
    ORDER BY created_at DESC LIMIT 5);
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.mis_turnos_push_guardar(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_turnos_push_guardar(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- Deja de avisar a este celular (al desactivar o al salir)
CREATE OR REPLACE FUNCTION public.mis_turnos_push_borrar(p_token TEXT, p_endpoint TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  DELETE FROM public.push_subscriptions
  WHERE endpoint = p_endpoint AND worker_id = public.mis_turnos_worker(p_token)
$$;
REVOKE EXECUTE ON FUNCTION public.mis_turnos_push_borrar(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mis_turnos_push_borrar(TEXT, TEXT) TO anon, authenticated;

-- ¿La trabajadora ya puede ver ese mes en Mis turnos? (misma regla que mis_turnos_get)
CREATE OR REPLACE FUNCTION public.mis_turnos_mes_visible(p_worker_id TEXT, p_month_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.published_schedule_days d
    JOIN public.published_schedules p ON p.month_key = d.month_key AND p.sucursal = d.sucursal
    LEFT JOIN public.publish_ocultos o ON o.month_key = d.month_key AND o.worker_id = d.worker_id
    CROSS JOIN LATERAL (SELECT COALESCE(o.visible_desde, p.visible_desde) AS desde) v
    WHERE d.worker_id = p_worker_id AND d.month_key = p_month_key
      AND (v.desde IS NULL OR v.desde <= (now() AT TIME ZONE 'America/Santiago')::date)
      AND (d.month_key = ANY(public.mis_turnos_visible_months())
           OR (v.desde IS NOT NULL
               AND d.month_key >= to_char(now() AT TIME ZONE 'America/Santiago', 'YYYY-MM')))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.mis_turnos_mes_visible(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Pide a la función «enviar-avisos» que mande lo que haya en la cola.
-- pg_net la llama recién cuando se guarda la publicación; una sola vez por publicación.
CREATE OR REPLACE FUNCTION public.push_despachar()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
BEGIN
  IF current_setting('dyl.push_despachado', true) = '1' THEN RETURN; END IF;
  SELECT function_url INTO v_url FROM public.push_config WHERE id = 1;
  IF v_url IS NULL THEN RETURN; END IF;
  PERFORM set_config('dyl.push_despachado', '1', true);
  BEGIN
    PERFORM net.http_post(url := v_url, body := '{}'::jsonb,
                          headers := '{"Content-Type": "application/json"}'::jsonb);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push_despachar: %', SQLERRM;
  END;
END $$;
REVOKE EXECUTE ON FUNCTION public.push_despachar() FROM PUBLIC, anon, authenticated;

-- "13 de noviembre", "13 y 20 de noviembre", "13, 14 y 20 de noviembre", "13, 14, 20 y 2 días más de noviembre"
CREATE OR REPLACE FUNCTION public.push_dias_texto(p_month_key TEXT, p_dias INT[])
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = public
AS $$
DECLARE
  v_meses TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                          'septiembre','octubre','noviembre','diciembre'];
  v_mes TEXT := v_meses[split_part(p_month_key, '-', 2)::INT];
  v_n INT := cardinality(p_dias);
  v_txt TEXT;
BEGIN
  IF v_n = 0 THEN RETURN v_mes; END IF;
  IF v_n = 1 THEN RETURN (p_dias[1] + 1) || ' de ' || v_mes; END IF;
  IF v_n <= 3 THEN
    SELECT string_agg((d + 1)::TEXT, ', ' ORDER BY d) INTO v_txt
    FROM unnest(p_dias[1:v_n - 1]) d;
    RETURN v_txt || ' y ' || (p_dias[v_n] + 1) || ' de ' || v_mes;
  END IF;
  SELECT string_agg((d + 1)::TEXT, ', ' ORDER BY d) INTO v_txt FROM unnest(p_dias[1:3]) d;
  RETURN v_txt || ' y ' || (v_n - 3) || CASE WHEN v_n - 3 = 1 THEN ' día' ELSE ' días' END
         || ' más de ' || v_mes;
END $$;

-- Cambio en la malla publicada de una trabajadora: en vivo + aviso al celular
CREATE OR REPLACE FUNCTION public.tg_published_days_avisar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.published_schedule_days;
  v_meses TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                          'septiembre','octubre','noviembre','diciembre'];
  v_mes TEXT;
  v_body TEXT;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM public.mis_turnos_ping(v_row.worker_id);

  IF TG_OP = 'DELETE' THEN RETURN NULL; END IF;
  -- Solo cuando de verdad se le publicó algo nuevo (no al renombrar un turno)
  IF TG_OP = 'UPDATE' AND NEW.published_at IS NOT DISTINCT FROM OLD.published_at
     AND NEW.changed_at IS NOT DISTINCT FROM OLD.changed_at THEN
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_subscriptions WHERE worker_id = NEW.worker_id) THEN
    RETURN NULL;
  END IF;
  IF NOT public.mis_turnos_mes_visible(NEW.worker_id, NEW.month_key) THEN
    RETURN NULL;
  END IF;

  v_mes := v_meses[split_part(NEW.month_key, '-', 2)::INT];
  IF TG_OP = 'UPDATE' AND cardinality(COALESCE(NEW.changed_days, '{}')) > 0
     AND NEW.changed_at IS DISTINCT FROM OLD.changed_at THEN
    v_body := CASE WHEN cardinality(NEW.changed_days) = 1 THEN 'Cambió tu turno del '
                   ELSE 'Cambiaron tus turnos del ' END
              || public.push_dias_texto(NEW.month_key, NEW.changed_days)
              || '. Toca para verlo.';
  ELSIF TG_OP = 'INSERT' THEN
    v_body := 'Ya está publicada tu malla de ' || v_mes || '. Toca para verla.';
  ELSE
    v_body := 'Se actualizó tu malla de ' || v_mes || '. Toca para verla.';
  END IF;

  INSERT INTO public.push_queue (worker_id, title, body)
  VALUES (NEW.worker_id, 'Mis turnos DyL', v_body);
  PERFORM public.push_despachar();
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_published_days_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS published_days_avisar ON public.published_schedule_days;
CREATE TRIGGER published_days_avisar
AFTER INSERT OR UPDATE OR DELETE ON public.published_schedule_days
FOR EACH ROW EXECUTE FUNCTION public.tg_published_days_avisar();

-- Cambios en solicitudes (aprobada, rechazada, compañera que responde): en vivo
CREATE OR REPLACE FUNCTION public.tg_shift_requests_avisar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.shift_requests;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM public.mis_turnos_ping(v_row.worker_id);
  IF v_row.companera_id IS NOT NULL THEN
    PERFORM public.mis_turnos_ping(v_row.companera_id);
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_shift_requests_avisar() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS shift_requests_avisar ON public.shift_requests;
CREATE TRIGGER shift_requests_avisar
AFTER INSERT OR UPDATE OR DELETE ON public.shift_requests
FOR EACH ROW EXECUTE FUNCTION public.tg_shift_requests_avisar();

NOTIFY pgrst, 'reload schema';

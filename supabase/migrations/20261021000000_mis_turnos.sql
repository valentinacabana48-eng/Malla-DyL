-- ─── Mis turnos: cada trabajadora ve su malla publicada ─────────────────────
-- * Ingreso con RUT + clave de 4 a 6 números (cifrada con pgcrypto, bloqueo de 15 min
--   tras 5 intentos fallidos). Las trabajadoras NO tienen cuenta de Supabase: entran por
--   funciones que devuelven solo su propia malla.
-- * Publicar: la admin general o la admin de la sucursal guarda una copia de la malla del
--   mes por sucursal. La trabajadora ve solo esa copia, no la malla en edición.
-- * Visibilidad (se controla aquí, con la fecha de Chile): mes actual siempre, el siguiente
--   desde 7 días antes de que empiece y el anterior hasta 7 días después de que termine.
-- Solo agrega tablas y funciones nuevas (sin DROP).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ─── RUT sin puntos ni guion, para comparar como sea que se escriba ──────────
CREATE OR REPLACE FUNCTION public.normalize_rut(p_rut TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT ltrim(upper(regexp_replace(COALESCE(p_rut, ''), '[^0-9kK]', '', 'g')), '0')
$$;

CREATE INDEX IF NOT EXISTS workers_rut_normalizado ON public.workers (public.normalize_rut(rut));

-- ─── Claves (nadie las lee directo: sin políticas, solo las funciones) ───────
CREATE TABLE IF NOT EXISTS public.worker_pins (
  worker_id       TEXT PRIMARY KEY REFERENCES public.workers(id) ON DELETE CASCADE,
  pin_hash        TEXT NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.worker_pins ENABLE ROW LEVEL SECURITY;

-- Sesiones de Mis turnos: se guarda solo el hash del token
CREATE TABLE IF NOT EXISTS public.worker_sessions (
  token_hash TEXT PRIMARY KEY,
  worker_id  TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS worker_sessions_worker ON public.worker_sessions (worker_id);
CREATE INDEX IF NOT EXISTS worker_sessions_expires ON public.worker_sessions (expires_at);
ALTER TABLE public.worker_sessions ENABLE ROW LEVEL SECURITY;

-- ─── Mallas publicadas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.published_schedules (
  month_key    TEXT NOT NULL,
  sucursal     TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID,
  PRIMARY KEY (month_key, sucursal)
);
ALTER TABLE public.published_schedules ENABLE ROW LEVEL SECURITY;

-- Copia por trabajadora y mes. days: un elemento por día del mes, null o
-- {"c": código, "l": nombre, "s": entrada, "e": salida, "col": colación, "esp": día especial}.
-- prev_days: lo que tenía publicado antes del último cambio; changed_days: días que cambiaron.
CREATE TABLE IF NOT EXISTS public.published_schedule_days (
  month_key    TEXT NOT NULL,
  worker_id    TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  sucursal     TEXT NOT NULL,
  days         JSONB NOT NULL DEFAULT '[]'::jsonb,
  prev_days    JSONB,
  changed_days INT[] NOT NULL DEFAULT '{}',
  changed_at   TIMESTAMPTZ,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month_key, worker_id)
);
CREATE INDEX IF NOT EXISTS published_schedule_days_month_sucursal
  ON public.published_schedule_days (month_key, sucursal);
ALTER TABLE public.published_schedule_days ENABLE ROW LEVEL SECURITY;

-- Las admins y lectoras ven lo publicado de sus sucursales; escribir solo con publish_schedule()
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'published_schedules' AND policyname = 'published_schedules_read') THEN
    CREATE POLICY published_schedules_read ON public.published_schedules
      FOR SELECT TO authenticated USING (public.can_see_sucursal(sucursal));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                 AND tablename = 'published_schedule_days' AND policyname = 'published_schedule_days_read') THEN
    CREATE POLICY published_schedule_days_read ON public.published_schedule_days
      FOR SELECT TO authenticated USING (public.can_see_sucursal(sucursal));
  END IF;
END $$;

-- ─── Malla de un mes como la ve la trabajadora ──────────────────────────────
-- El día especial manda sobre el turno (igual que en la Malla).
CREATE OR REPLACE FUNCTION public.effective_month_days(p_month_key TEXT, p_worker_id TEXT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN src.special ->> (g.i::text) IS NOT NULL THEN
        jsonb_strip_nulls(jsonb_build_object(
          'c', src.special ->> (g.i::text), 'esp', true, 'l', nwt.label))
      WHEN src.sched ->> g.i IS NOT NULL THEN
        jsonb_strip_nulls(jsonb_build_object(
          'c', src.sched ->> g.i, 'l', sh.label,
          's', NULLIF(sh.start_time, ''), 'e', NULLIF(sh.end_time, ''),
          'col', NULLIF(sh.colacion, 0)))
      ELSE 'null'::jsonb
    END ORDER BY g.i), '[]'::jsonb)
  FROM (
    SELECT EXTRACT(DAY FROM (to_date(p_month_key || '-01', 'YYYY-MM-DD')
                             + INTERVAL '1 month' - INTERVAL '1 day'))::int AS n
  ) m
  CROSS JOIN (
    SELECT
      (SELECT days FROM public.schedule_data
        WHERE month_key = p_month_key AND worker_id = p_worker_id) AS sched,
      (SELECT days FROM public.special_days_v2
        WHERE month_key = p_month_key AND worker_id = p_worker_id) AS special
  ) src
  CROSS JOIN LATERAL generate_series(0, m.n - 1) AS g(i)
  LEFT JOIN public.custom_non_working_types nwt ON nwt.code = src.special ->> (g.i::text)
  LEFT JOIN public.shifts sh ON sh.code = src.sched ->> g.i
$$;

-- ─── Publicar la malla de una sucursal y mes ────────────────────────────────
-- Devuelve una fila por trabajadora nueva en la publicación o con días cambiados.
CREATE OR REPLACE FUNCTION public.publish_schedule(p_month_key TEXT, p_sucursal TEXT)
RETURNS TABLE (r_worker_id TEXT, r_changed INT, r_is_new BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w RECORD;
  v_days JSONB;
  v_old JSONB;
  v_changed INT[];
BEGIN
  IF NOT public.can_edit_sucursal(p_sucursal) THEN
    RAISE EXCEPTION 'Sin permiso para publicar la malla de %', p_sucursal;
  END IF;
  IF p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido: %', p_month_key;
  END IF;

  -- Dos personas publicando la misma malla a la vez: una espera a la otra
  PERFORM pg_advisory_xact_lock(hashtext('publish:' || p_month_key || ':' || p_sucursal));

  -- Quien ya no está activa en la sucursal sale de la publicación
  DELETE FROM public.published_schedule_days d
  WHERE d.month_key = p_month_key AND d.sucursal = p_sucursal
    AND NOT EXISTS (SELECT 1 FROM public.workers x
                    WHERE x.id = d.worker_id AND x.sucursal = p_sucursal AND x.estado = 'Activo');

  FOR w IN SELECT id FROM public.workers WHERE sucursal = p_sucursal AND estado = 'Activo' LOOP
    v_days := public.effective_month_days(p_month_key, w.id);
    v_old := NULL;
    SELECT d.days INTO v_old FROM public.published_schedule_days d
    WHERE d.month_key = p_month_key AND d.worker_id = w.id;

    IF NOT FOUND THEN
      INSERT INTO public.published_schedule_days (month_key, worker_id, sucursal, days)
      VALUES (p_month_key, w.id, p_sucursal, v_days);
      r_worker_id := w.id; r_changed := 0; r_is_new := true;
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Un cambio de nombre del turno no cuenta: solo código y horario
    SELECT COALESCE(array_agg(g.i ORDER BY g.i), '{}') INTO v_changed
    FROM generate_series(0, GREATEST(jsonb_array_length(v_days), jsonb_array_length(v_old)) - 1) AS g(i)
    WHERE (CASE WHEN jsonb_typeof(v_days -> g.i) = 'object' THEN (v_days -> g.i) - 'l' ELSE v_days -> g.i END)
          IS DISTINCT FROM
          (CASE WHEN jsonb_typeof(v_old -> g.i) = 'object' THEN (v_old -> g.i) - 'l' ELSE v_old -> g.i END);

    IF cardinality(v_changed) > 0 THEN
      UPDATE public.published_schedule_days
      SET days = v_days, prev_days = v_old, changed_days = v_changed, changed_at = now(),
          published_at = now(), sucursal = p_sucursal
      WHERE month_key = p_month_key AND worker_id = w.id;
      r_worker_id := w.id; r_changed := cardinality(v_changed); r_is_new := false;
      RETURN NEXT;
    ELSE
      UPDATE public.published_schedule_days
      SET days = v_days, sucursal = p_sucursal
      WHERE month_key = p_month_key AND worker_id = w.id;
    END IF;
  END LOOP;

  INSERT INTO public.published_schedules (month_key, sucursal, published_at, published_by)
  VALUES (p_month_key, p_sucursal, now(), auth.uid())
  ON CONFLICT (month_key, sucursal) DO UPDATE
    SET published_at = EXCLUDED.published_at, published_by = EXCLUDED.published_by;
END $$;

-- ─── Claves: asignar y ver si tiene ─────────────────────────────────────────
-- p_pin NULL quita la clave. Cambiar o quitar la clave cierra sus sesiones abiertas.
CREATE OR REPLACE FUNCTION public.set_worker_pin(p_worker_id TEXT, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.can_edit_worker(p_worker_id) THEN
    RAISE EXCEPTION 'Sin permiso para cambiar la clave de esta trabajadora';
  END IF;

  DELETE FROM public.worker_sessions WHERE worker_id = p_worker_id;

  IF p_pin IS NULL THEN
    DELETE FROM public.worker_pins WHERE worker_id = p_worker_id;
    RETURN;
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'La clave debe tener de 4 a 6 números';
  END IF;

  INSERT INTO public.worker_pins (worker_id, pin_hash)
  VALUES (p_worker_id, crypt(p_pin, gen_salt('bf', 8)))
  ON CONFLICT (worker_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.worker_pin_status(p_worker_ids TEXT[])
RETURNS TABLE (r_worker_id TEXT, r_updated_at TIMESTAMPTZ, r_locked_until TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.worker_id, p.updated_at, p.locked_until
  FROM public.worker_pins p
  WHERE p.worker_id = ANY(p_worker_ids) AND public.can_edit_worker(p.worker_id)
$$;

-- ─── Ingreso de la trabajadora ───────────────────────────────────────────────
-- Respuesta: {ok:true, token, expires_at} o {ok:false, error:'datos'|'bloqueada'}.
-- No dice si el RUT existe: RUT o clave incorrectos dan el mismo error.
CREATE OR REPLACE FUNCTION public.mis_turnos_login(p_rut TEXT, p_pin TEXT, p_remember BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_rut TEXT := public.normalize_rut(p_rut);
  c RECORD;
  v_locked BOOLEAN := false;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  IF v_rut = '' OR p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'datos');
  END IF;

  DELETE FROM public.worker_sessions WHERE expires_at < now();

  FOR c IN
    SELECT w.id, p.pin_hash, p.failed_attempts, p.locked_until
    FROM public.workers w
    JOIN public.worker_pins p ON p.worker_id = w.id
    WHERE public.normalize_rut(w.rut) = v_rut AND w.estado = 'Activo'
    FOR UPDATE OF p
  LOOP
    IF c.locked_until IS NOT NULL AND c.locked_until > now() THEN
      v_locked := true;
      CONTINUE;
    END IF;

    IF c.pin_hash = crypt(p_pin, c.pin_hash) THEN
      UPDATE public.worker_pins SET failed_attempts = 0, locked_until = NULL WHERE worker_id = c.id;
      v_token := encode(gen_random_bytes(32), 'hex');
      v_expires := now() + CASE WHEN p_remember THEN INTERVAL '120 days' ELSE INTERVAL '12 hours' END;
      INSERT INTO public.worker_sessions (token_hash, worker_id, expires_at)
      VALUES (encode(digest(v_token, 'sha256'), 'hex'), c.id, v_expires);
      RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
    END IF;

    -- 5 intentos fallidos: 15 minutos bloqueada y vuelve a contar desde cero
    IF c.failed_attempts + 1 >= 5 THEN
      UPDATE public.worker_pins
      SET failed_attempts = 0, locked_until = now() + INTERVAL '15 minutes'
      WHERE worker_id = c.id;
      v_locked := true;
    ELSE
      UPDATE public.worker_pins SET failed_attempts = failed_attempts + 1 WHERE worker_id = c.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error', CASE WHEN v_locked THEN 'bloqueada' ELSE 'datos' END);
END $$;

-- Trabajadora de una sesión vigente (NULL si el token no sirve)
CREATE OR REPLACE FUNCTION public.mis_turnos_worker(p_token TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT s.worker_id
  FROM public.worker_sessions s
  JOIN public.workers w ON w.id = s.worker_id
  WHERE s.token_hash = encode(digest(COALESCE(p_token, ''), 'sha256'), 'hex')
    AND s.expires_at > now()
    AND w.estado = 'Activo'
$$;

-- Meses que se pueden mostrar hoy (fecha de Chile)
CREATE OR REPLACE FUNCTION public.mis_turnos_visible_months()
RETURNS TEXT[]
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN hoy <= (date_trunc('month', hoy) - INTERVAL '1 day')::date + 7
         THEN to_char(date_trunc('month', hoy) - INTERVAL '1 month', 'YYYY-MM') END,
    to_char(hoy, 'YYYY-MM'),
    CASE WHEN hoy >= (date_trunc('month', hoy) + INTERVAL '1 month')::date - 7
         THEN to_char(date_trunc('month', hoy) + INTERVAL '1 month', 'YYYY-MM') END
  ], NULL)
  FROM (SELECT (now() AT TIME ZONE 'America/Santiago')::date AS hoy) t
$$;

-- Malla publicada de la trabajadora. p_month_key NULL = el mes actual (o el primero disponible).
CREATE OR REPLACE FUNCTION public.mis_turnos_get(p_token TEXT, p_month_key TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_name TEXT;
  v_sucursal TEXT;
  v_avail TEXT[];
  v_hoy TEXT := to_char(now() AT TIME ZONE 'America/Santiago', 'YYYY-MM');
  v_month TEXT;
  v_days JSONB;
  v_prev JSONB;
  v_changed INT[];
  v_changed_at TIMESTAMPTZ;
  v_published_at TIMESTAMPTZ;
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;

  SELECT name, sucursal INTO v_name, v_sucursal FROM public.workers WHERE id = v_wid;

  SELECT COALESCE(array_agg(d.month_key ORDER BY d.month_key), '{}') INTO v_avail
  FROM public.published_schedule_days d
  JOIN public.published_schedules p ON p.month_key = d.month_key AND p.sucursal = d.sucursal
  WHERE d.worker_id = v_wid AND d.month_key = ANY(public.mis_turnos_visible_months());

  v_month := CASE
    WHEN p_month_key = ANY(v_avail) THEN p_month_key
    WHEN v_hoy = ANY(v_avail) THEN v_hoy
    ELSE v_avail[1]
  END;

  IF v_month IS NOT NULL THEN
    SELECT d.days, d.prev_days, d.changed_days, d.changed_at, d.published_at
    INTO v_days, v_prev, v_changed, v_changed_at, v_published_at
    FROM public.published_schedule_days d
    WHERE d.month_key = v_month AND d.worker_id = v_wid;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'name', v_name,
    'sucursal', v_sucursal,
    'months', to_jsonb(v_avail),
    'month_key', v_month,
    'days', v_days,
    'prev_days', v_prev,
    'changed_days', to_jsonb(COALESCE(v_changed, '{}')),
    'changed_at', v_changed_at,
    'published_at', v_published_at
  );
END $$;

CREATE OR REPLACE FUNCTION public.mis_turnos_logout(p_token TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public, extensions
AS $$
  DELETE FROM public.worker_sessions
  WHERE token_hash = encode(digest(COALESCE(p_token, ''), 'sha256'), 'hex')
$$;

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
-- Internas: solo las usan las otras funciones
REVOKE EXECUTE ON FUNCTION
  public.effective_month_days(TEXT, TEXT),
  public.mis_turnos_worker(TEXT),
  public.mis_turnos_visible_months()
FROM PUBLIC, anon, authenticated;

-- Para las admins (con sesión iniciada)
REVOKE EXECUTE ON FUNCTION
  public.publish_schedule(TEXT, TEXT),
  public.set_worker_pin(TEXT, TEXT),
  public.worker_pin_status(TEXT[])
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.publish_schedule(TEXT, TEXT),
  public.set_worker_pin(TEXT, TEXT),
  public.worker_pin_status(TEXT[])
TO authenticated;

-- Para la página Mis turnos (sin cuenta)
REVOKE EXECUTE ON FUNCTION
  public.mis_turnos_login(TEXT, TEXT, BOOLEAN),
  public.mis_turnos_get(TEXT, TEXT),
  public.mis_turnos_logout(TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.mis_turnos_login(TEXT, TEXT, BOOLEAN),
  public.mis_turnos_get(TEXT, TEXT),
  public.mis_turnos_logout(TEXT)
TO anon, authenticated;

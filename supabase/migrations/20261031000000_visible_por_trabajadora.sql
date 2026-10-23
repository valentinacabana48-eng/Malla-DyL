-- ─── Fecha de visibilidad por trabajadora ───────────────────────────────────
-- En "Ocultar días" se puede poner, por trabajadora, desde qué día ve su malla del mes
-- (por ejemplo, días 1 al 10 ocultos porque su contrato empieza el 11, y la ve desde el 9).
-- Si no tiene fecha propia, vale la fecha de la malla de la sucursal (o la regla de siempre).
-- p_ocultos acepta [desde_dia, hasta_dia] o [desde_dia, hasta_dia, "YYYY-MM-DD"].
-- Se puede volver a ejecutar sin error.

ALTER TABLE public.publish_ocultos ADD COLUMN IF NOT EXISTS visible_desde DATE;

-- p_ocultos: { "worker_id": [desde_dia, hasta_dia, visible_desde?] } con todos los tramos
-- ocultos de la sucursal (el mes completo = no se le publica). NULL deja los guardados.
-- p_visible_desde: desde qué día se ve la malla. NULL deja la fecha guardada como está.
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_month_key TEXT, p_sucursal TEXT, p_ocultos JSONB, p_visible_desde DATE)
RETURNS TABLE (r_worker_id TEXT, r_changed INT, r_is_new BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  w RECORD;
  v_days JSONB;
  v_old JSONB;
  v_changed INT[];
  v_desde INT;
  v_hasta INT;
  v_n INT;
BEGIN
  IF NOT (public.has_perm('malla_publicar') AND public.in_my_sucursales(p_sucursal)) THEN
    RAISE EXCEPTION 'Sin permiso para publicar la malla de %', p_sucursal;
  END IF;
  IF p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido: %', p_month_key;
  END IF;

  -- Dos personas publicando la misma malla a la vez: una espera a la otra
  PERFORM pg_advisory_xact_lock(hashtext('publish:' || p_month_key || ':' || p_sucursal));

  -- Tramos ocultos: se reemplazan los de las trabajadoras de su alcance en la sucursal
  IF p_ocultos IS NOT NULL THEN
    DELETE FROM public.publish_ocultos o
    USING public.workers x
    WHERE o.month_key = p_month_key AND x.id = o.worker_id AND x.sucursal = p_sucursal
      AND public.in_my_scope(x.sucursal, x.area, x.cargo);
    INSERT INTO public.publish_ocultos (month_key, worker_id, desde_dia, hasta_dia, visible_desde)
    SELECT p_month_key, x.id, (e.value ->> 0)::INT, (e.value ->> 1)::INT,
           NULLIF(e.value ->> 2, '')::DATE
    FROM jsonb_each(p_ocultos) e
    JOIN public.workers x ON x.id = e.key
    WHERE x.sucursal = p_sucursal AND public.in_my_scope(x.sucursal, x.area, x.cargo);
  END IF;

  -- Quien ya no está activa en la sucursal sale de la publicación (solo de su alcance)
  DELETE FROM public.published_schedule_days d
  WHERE d.month_key = p_month_key AND d.sucursal = p_sucursal
    AND public.worker_in_scope(d.worker_id)
    AND NOT EXISTS (SELECT 1 FROM public.workers x
                    WHERE x.id = d.worker_id AND x.sucursal = p_sucursal AND x.estado = 'Activo');

  FOR w IN
    SELECT id FROM public.workers
    WHERE sucursal = p_sucursal AND estado = 'Activo' AND public.in_my_scope(sucursal, area, cargo)
  LOOP
    v_days := public.effective_month_days(p_month_key, w.id);
    v_n := jsonb_array_length(v_days);
    v_desde := NULL;
    SELECT o.desde_dia, o.hasta_dia INTO v_desde, v_hasta
    FROM public.publish_ocultos o WHERE o.month_key = p_month_key AND o.worker_id = w.id;

    IF v_desde IS NOT NULL THEN
      -- Oculta todo el mes: no se le publica
      IF v_desde <= 1 AND v_hasta >= v_n THEN
        DELETE FROM public.published_schedule_days d
        WHERE d.month_key = p_month_key AND d.worker_id = w.id;
        CONTINUE;
      END IF;
      SELECT COALESCE(jsonb_agg(CASE WHEN g.i + 1 BETWEEN v_desde AND v_hasta THEN 'null'::jsonb
                                     ELSE v_days -> g.i END ORDER BY g.i), '[]'::jsonb)
      INTO v_days
      FROM generate_series(0, v_n - 1) AS g(i);
    END IF;

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

  INSERT INTO public.published_schedules (month_key, sucursal, published_at, published_by, visible_desde)
  VALUES (p_month_key, p_sucursal, now(), auth.uid(), p_visible_desde)
  ON CONFLICT (month_key, sucursal) DO UPDATE
    SET published_at = EXCLUDED.published_at, published_by = EXCLUDED.published_by,
        visible_desde = COALESCE(EXCLUDED.visible_desde, public.published_schedules.visible_desde);
END $$;

-- Mis turnos: un mes se ve si está publicado, ya llegó su fecha de visibilidad (la de la
-- trabajadora o, si no tiene, la de la malla) y está dentro de lo que se muestra.
CREATE OR REPLACE FUNCTION public.mis_turnos_get(p_token TEXT, p_month_key TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_name TEXT;
  v_sucursal TEXT;
  v_avail TEXT[];
  v_hoy_fecha DATE := (now() AT TIME ZONE 'America/Santiago')::date;
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
  LEFT JOIN public.publish_ocultos o ON o.month_key = d.month_key AND o.worker_id = d.worker_id
  CROSS JOIN LATERAL (SELECT COALESCE(o.visible_desde, p.visible_desde) AS desde) v
  WHERE d.worker_id = v_wid
    AND (v.desde IS NULL OR v.desde <= v_hoy_fecha)
    AND (d.month_key = ANY(public.mis_turnos_visible_months())
         OR (v.desde IS NOT NULL AND d.month_key >= v_hoy));

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

-- ─── Publicar solo a quien se le modificó ──────────────────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • Al publicar se puede elegir qué cambios pendientes salen (p_solo: la lista de
--     trabajadoras). A las demás no se les toca nada: siguen viendo lo que ya tenían
--     publicado y sus cambios quedan pendientes para la próxima vez.
--   • En borrador, la fecha «Publicada el…» de Mis turnos solo se renueva a quien de
--     verdad le cambió el turno (antes se renovaba a todas).
--   • Las versiones de tres, cuatro y cinco parámetros siguen funcionando: publican a
--     todas, como siempre.
-- Se puede volver a ejecutar sin error.

-- p_solo: ids de las trabajadoras a las que se les publica. NULL = a todas (como siempre).
-- El resto de los parámetros es igual que en la versión de cinco.
-- Devuelve una fila por trabajadora nueva o con cambios que verá con el aviso «Cambió».
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_month_key TEXT, p_sucursal TEXT, p_ocultos JSONB, p_visible_desde DATE,
  p_definitiva BOOLEAN, p_solo TEXT[])
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
  v_definitiva BOOLEAN;
BEGIN
  IF NOT (public.has_perm('malla_publicar') AND public.in_my_sucursales(p_sucursal)) THEN
    RAISE EXCEPTION 'Sin permiso para publicar la malla de %', p_sucursal;
  END IF;
  IF p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido: %', p_month_key;
  END IF;

  -- Dos personas publicando la misma malla a la vez: una espera a la otra
  PERFORM pg_advisory_xact_lock(hashtext('publish:' || p_month_key || ':' || p_sucursal));

  -- Si ya era definitiva antes de esta publicación, los cambios llevan el aviso «Cambió».
  -- Si era borrador, se reemplaza sin aviso (también al marcarla definitiva ahora).
  SELECT COALESCE(p.definitiva, false) INTO v_definitiva
  FROM public.published_schedules p WHERE p.month_key = p_month_key AND p.sucursal = p_sucursal;
  v_definitiva := COALESCE(v_definitiva, false);

  -- Tramos ocultos: se reemplazan los de las trabajadoras elegidas de su alcance en la sucursal
  IF p_ocultos IS NOT NULL THEN
    DELETE FROM public.publish_ocultos o
    USING public.workers x
    WHERE o.month_key = p_month_key AND x.id = o.worker_id AND x.sucursal = p_sucursal
      AND public.in_my_scope(x.sucursal, x.area, x.cargo)
      AND (p_solo IS NULL OR x.id = ANY(p_solo));
    INSERT INTO public.publish_ocultos (month_key, worker_id, desde_dia, hasta_dia, visible_desde)
    SELECT p_month_key, x.id, (e.value ->> 0)::INT, (e.value ->> 1)::INT,
           NULLIF(e.value ->> 2, '')::DATE
    FROM jsonb_each(p_ocultos) e
    JOIN public.workers x ON x.id = e.key
    WHERE x.sucursal = p_sucursal AND public.in_my_scope(x.sucursal, x.area, x.cargo)
      AND (p_solo IS NULL OR x.id = ANY(p_solo));
  END IF;

  -- Quien ya no está activa en la sucursal sale de la publicación (solo de su alcance)
  DELETE FROM public.published_schedule_days d
  WHERE d.month_key = p_month_key AND d.sucursal = p_sucursal
    AND public.worker_in_scope(d.worker_id)
    AND (p_solo IS NULL OR d.worker_id = ANY(p_solo))
    AND NOT EXISTS (SELECT 1 FROM public.workers x
                    WHERE x.id = d.worker_id AND x.sucursal = p_sucursal AND x.estado = 'Activo');

  FOR w IN
    SELECT id FROM public.workers
    WHERE sucursal = p_sucursal AND estado = 'Activo' AND public.in_my_scope(sucursal, area, cargo)
      AND (p_solo IS NULL OR id = ANY(p_solo))
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

    IF cardinality(v_changed) = 0 THEN
      -- Sin cambios de turno: se guarda igual (por si cambió el nombre), sin tocar la fecha
      UPDATE public.published_schedule_days
      SET days = v_days, sucursal = p_sucursal
      WHERE month_key = p_month_key AND worker_id = w.id;
    ELSIF NOT v_definitiva THEN
      -- Borrador: se reemplaza sin aviso de cambio
      UPDATE public.published_schedule_days
      SET days = v_days, prev_days = NULL, changed_days = '{}', changed_at = NULL,
          published_at = now(), sucursal = p_sucursal
      WHERE month_key = p_month_key AND worker_id = w.id;
    ELSE
      UPDATE public.published_schedule_days
      SET days = v_days, prev_days = v_old, changed_days = v_changed, changed_at = now(),
          published_at = now(), sucursal = p_sucursal
      WHERE month_key = p_month_key AND worker_id = w.id;
      r_worker_id := w.id; r_changed := cardinality(v_changed); r_is_new := false;
      RETURN NEXT;
    END IF;
  END LOOP;

  INSERT INTO public.published_schedules
    (month_key, sucursal, published_at, published_by, visible_desde, definitiva)
  VALUES (p_month_key, p_sucursal, now(), auth.uid(), p_visible_desde, COALESCE(p_definitiva, false))
  ON CONFLICT (month_key, sucursal) DO UPDATE
    SET published_at = EXCLUDED.published_at, published_by = EXCLUDED.published_by,
        visible_desde = COALESCE(EXCLUDED.visible_desde, public.published_schedules.visible_desde),
        definitiva = COALESCE(p_definitiva, public.published_schedules.definitiva);
END $$;

REVOKE EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB, DATE, BOOLEAN, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB, DATE, BOOLEAN, TEXT[]) TO authenticated;

-- La de cinco parámetros publica a todas, como siempre
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_month_key TEXT, p_sucursal TEXT, p_ocultos JSONB, p_visible_desde DATE, p_definitiva BOOLEAN)
RETURNS TABLE (r_worker_id TEXT, r_changed INT, r_is_new BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.publish_schedule(p_month_key, p_sucursal, p_ocultos, p_visible_desde,
                                        p_definitiva, NULL::TEXT[])
$$;

REVOKE EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB, DATE, BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

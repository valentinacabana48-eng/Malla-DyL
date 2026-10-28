-- ─── Malla definitiva ───────────────────────────────────────────────────────
-- Al publicar se puede marcar la malla del mes como "Definitiva". Mientras no lo es, es
-- un borrador: volver a publicar la reemplaza en Mis turnos sin el aviso «Cambió», para
-- poder corregir errores sin que las trabajadoras crean que les cambiaron el turno.
-- Desde que es definitiva, cada cambio que se publique sí lleva el aviso, como siempre.
-- Las mallas ya publicadas: las de este mes o anteriores quedan definitivas; las de meses
-- que vienen quedan como borrador y se les borran los avisos «Cambió» que tenían.
-- Las versiones de tres y cuatro parámetros siguen funcionando y no cambian lo guardado.
-- Se puede volver a ejecutar sin error.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'published_schedules'
                   AND column_name = 'definitiva') THEN
    ALTER TABLE public.published_schedules ADD COLUMN definitiva BOOLEAN NOT NULL DEFAULT false;
    UPDATE public.published_schedules
    SET definitiva = month_key <= to_char(now() AT TIME ZONE 'America/Santiago', 'YYYY-MM');
    UPDATE public.published_schedule_days d
    SET prev_days = NULL, changed_days = '{}', changed_at = NULL
    FROM public.published_schedules p
    WHERE p.month_key = d.month_key AND p.sucursal = d.sucursal AND NOT p.definitiva
      AND cardinality(d.changed_days) > 0;
  END IF;
END $$;

-- p_ocultos: { "worker_id": [desde_dia, hasta_dia, visible_desde?] } con todos los tramos
-- ocultos de la sucursal (el mes completo = no se le publica). NULL deja los guardados.
-- p_visible_desde: desde qué día se ve la malla. NULL deja la fecha guardada como está.
-- p_definitiva: si queda como definitiva. NULL deja lo guardado como está.
-- Devuelve una fila por trabajadora nueva o con cambios que verá con el aviso «Cambió».
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_month_key TEXT, p_sucursal TEXT, p_ocultos JSONB, p_visible_desde DATE, p_definitiva BOOLEAN)
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

    -- Borrador: se reemplaza sin aviso de cambio
    IF NOT v_definitiva THEN
      UPDATE public.published_schedule_days
      SET days = v_days, prev_days = NULL, changed_days = '{}', changed_at = NULL,
          published_at = now(), sucursal = p_sucursal
      WHERE month_key = p_month_key AND worker_id = w.id;
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

  INSERT INTO public.published_schedules
    (month_key, sucursal, published_at, published_by, visible_desde, definitiva)
  VALUES (p_month_key, p_sucursal, now(), auth.uid(), p_visible_desde, COALESCE(p_definitiva, false))
  ON CONFLICT (month_key, sucursal) DO UPDATE
    SET published_at = EXCLUDED.published_at, published_by = EXCLUDED.published_by,
        visible_desde = COALESCE(EXCLUDED.visible_desde, public.published_schedules.visible_desde),
        definitiva = COALESCE(p_definitiva, public.published_schedules.definitiva);
END $$;

REVOKE EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB, DATE, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB, DATE, BOOLEAN) TO authenticated;

-- La de cuatro parámetros publica sin cambiar si es definitiva
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_month_key TEXT, p_sucursal TEXT, p_ocultos JSONB, p_visible_desde DATE)
RETURNS TABLE (r_worker_id TEXT, r_changed INT, r_is_new BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.publish_schedule(p_month_key, p_sucursal, p_ocultos, p_visible_desde, NULL::BOOLEAN)
$$;

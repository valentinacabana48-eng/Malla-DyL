-- ─── Días sin contrato al publicar ───────────────────────────────────────────
-- Al publicar se puede marcar, por trabajadora, un tramo de días del mes que no debe
-- verse en Mis turnos (por ejemplo entre un finiquito y la recontratación). Esos días
-- quedan vacíos en la copia publicada. Si el tramo cubre el mes entero, el mes no se le
-- publica. El tramo queda guardado para las siguientes publicaciones del mismo mes.
-- La versión de dos parámetros sigue funcionando y respeta los tramos guardados.
-- Se puede volver a ejecutar sin error.

CREATE TABLE IF NOT EXISTS public.publish_ocultos (
  month_key TEXT NOT NULL,
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  -- Días del mes, desde 1, ambos incluidos
  desde_dia INT NOT NULL CHECK (desde_dia BETWEEN 1 AND 31),
  hasta_dia INT NOT NULL CHECK (hasta_dia BETWEEN 1 AND 31),
  CHECK (desde_dia <= hasta_dia),
  PRIMARY KEY (month_key, worker_id)
);
ALTER TABLE public.publish_ocultos ENABLE ROW LEVEL SECURITY;

-- Se lee para mostrarlo en la Malla; solo se escribe a través de publish_schedule
DROP POLICY IF EXISTS publish_ocultos_read ON public.publish_ocultos;
CREATE POLICY publish_ocultos_read ON public.publish_ocultos FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id));
GRANT SELECT ON public.publish_ocultos TO authenticated;

-- p_ocultos: { "worker_id": [desde_dia, hasta_dia] } con todos los tramos de la sucursal.
-- NULL deja los tramos guardados como están.
CREATE OR REPLACE FUNCTION public.publish_schedule(
  p_month_key TEXT, p_sucursal TEXT, p_ocultos JSONB)
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

  -- Tramos sin contrato: se reemplazan los de las trabajadoras de su alcance en la sucursal
  IF p_ocultos IS NOT NULL THEN
    DELETE FROM public.publish_ocultos o
    USING public.workers x
    WHERE o.month_key = p_month_key AND x.id = o.worker_id AND x.sucursal = p_sucursal
      AND public.in_my_scope(x.sucursal, x.area, x.cargo);
    INSERT INTO public.publish_ocultos (month_key, worker_id, desde_dia, hasta_dia)
    SELECT p_month_key, x.id, (e.value ->> 0)::INT, (e.value ->> 1)::INT
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
      -- Sin contrato todo el mes: no se le publica
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

  INSERT INTO public.published_schedules (month_key, sucursal, published_at, published_by)
  VALUES (p_month_key, p_sucursal, now(), auth.uid())
  ON CONFLICT (month_key, sucursal) DO UPDATE
    SET published_at = EXCLUDED.published_at, published_by = EXCLUDED.published_by;
END $$;

-- La de dos parámetros publica con los tramos ya guardados
CREATE OR REPLACE FUNCTION public.publish_schedule(p_month_key TEXT, p_sucursal TEXT)
RETURNS TABLE (r_worker_id TEXT, r_changed INT, r_is_new BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM public.publish_schedule(p_month_key, p_sucursal, NULL::JSONB)
$$;

REVOKE EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_schedule(TEXT, TEXT, JSONB) TO authenticated;

-- Limpieza de una función de prueba que no se usa
DROP FUNCTION IF EXISTS public._tmp_probe();

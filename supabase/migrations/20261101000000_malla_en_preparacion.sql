-- ─── Malla en preparación ────────────────────────────────────────────────────
-- Un mes que todavía no empieza queda "en preparación" hasta que se publica: solo lo ve
-- y lo edita quien puede publicar la malla de esa sucursal. El resto (por ejemplo, una
-- tesorería con permiso de ver o editar la malla) lo ve recién cuando está publicado y
-- llegó su fecha de visibilidad (la de la malla de la sucursal; sin fecha, al publicar).
-- El mes actual y los anteriores se ven siempre, como hasta ahora.
-- Se aplica a la malla (schedule_data), a los días especiales (special_days_v2) y a la
-- copia publicada (published_schedule_days), así tampoco se puede imprimir ni descargar.
-- Se puede volver a ejecutar sin error.

-- Si esta persona puede ver ese mes de la malla de esa sucursal
CREATE OR REPLACE FUNCTION public.malla_mes_abierto(p_month_key TEXT, p_sucursal TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p_month_key <= to_char(now() AT TIME ZONE 'America/Santiago', 'YYYY-MM')
    OR (public.has_perm('malla_publicar') AND public.in_my_sucursales(p_sucursal))
    OR EXISTS (
      SELECT 1 FROM public.published_schedules p
      WHERE p.month_key = p_month_key AND p.sucursal = p_sucursal
        AND (p.visible_desde IS NULL
             OR p.visible_desde <= (now() AT TIME ZONE 'America/Santiago')::date)
    )
$$;

-- Lo mismo, para la sucursal de esa trabajadora
CREATE OR REPLACE FUNCTION public.malla_mes_abierto_worker(p_month_key TEXT, p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT public.malla_mes_abierto(p_month_key, w.sucursal)
    FROM public.workers w WHERE w.id = p_worker_id
  ), false)
$$;

REVOKE EXECUTE ON FUNCTION public.malla_mes_abierto(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.malla_mes_abierto_worker(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.malla_mes_abierto(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.malla_mes_abierto_worker(TEXT, TEXT) TO authenticated;

-- Malla y días especiales: leer y editar piden además que el mes esté abierto
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedule_data', 'special_days_v2'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING ('
      'public.can_see_worker(worker_id) AND public.malla_mes_abierto_worker(month_key, worker_id))',
      t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK ('
      'public.can_edit_worker(worker_id) AND public.malla_mes_abierto_worker(month_key, worker_id))',
      t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING ('
      'public.can_edit_worker(worker_id) AND public.malla_mes_abierto_worker(month_key, worker_id)) '
      'WITH CHECK (public.can_edit_worker(worker_id) AND public.malla_mes_abierto_worker(month_key, worker_id))',
      t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING ('
      'public.can_edit_worker(worker_id) AND public.malla_mes_abierto_worker(month_key, worker_id))',
      t || '_delete', t);
  END LOOP;
END $$;

-- La copia publicada tampoco se ve antes de su fecha de visibilidad
DROP POLICY IF EXISTS published_schedule_days_read ON public.published_schedule_days;
CREATE POLICY published_schedule_days_read ON public.published_schedule_days
  FOR SELECT TO authenticated
  USING (public.can_see_sucursal(sucursal) AND public.can_see_worker(worker_id)
         AND public.malla_mes_abierto(month_key, sucursal));

-- Arrastre al cambiar de mes: no escribe en un mes en preparación de otra persona
CREATE OR REPLACE FUNCTION public.carry_over_month(
  p_prev_month TEXT, p_new_month TEXT, p_last_day_index INT)
RETURNS TABLE (r_worker_id TEXT, r_days JSONB)
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  INSERT INTO public.schedule_data (month_key, worker_id, days)
  SELECT p_new_month, p.worker_id, (SELECT jsonb_agg(NULL::text) FROM generate_series(1, 31))
  FROM public.schedule_data p
  WHERE p.month_key = p_prev_month
    AND COALESCE(p.days ->> p_last_day_index, 'DESC') <> 'DESC'
    AND public.can_edit_worker(p.worker_id)
    AND public.malla_mes_abierto_worker(p_new_month, p.worker_id)
  ON CONFLICT (month_key, worker_id) DO NOTHING;

  RETURN QUERY
  UPDATE public.schedule_data n
  SET days = jsonb_set(
        CASE WHEN jsonb_typeof(n.days) = 'array' THEN n.days ELSE '[]'::jsonb END,
        '{0}', p.days -> p_last_day_index),
      updated_at = now()
  FROM public.schedule_data p
  WHERE p.month_key = p_prev_month
    AND n.month_key = p_new_month
    AND n.worker_id = p.worker_id
    AND COALESCE(p.days ->> p_last_day_index, 'DESC') <> 'DESC'
    AND (jsonb_typeof(n.days) <> 'array' OR n.days -> 0 IS NULL OR n.days -> 0 = 'null'::jsonb)
    AND NOT EXISTS (
      SELECT 1 FROM public.special_days_v2 s
      WHERE s.month_key = p_new_month AND s.worker_id = n.worker_id AND s.days ? '0'
    )
    AND public.can_edit_worker(n.worker_id)
    AND public.malla_mes_abierto_worker(p_new_month, n.worker_id)
  RETURNING n.worker_id, n.days;
END $$;

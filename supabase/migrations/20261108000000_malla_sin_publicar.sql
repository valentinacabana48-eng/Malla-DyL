-- ─── Malla sin publicar: solo la ve quien publica ──────────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • Los meses que vienen (después del mes actual) solo se ven en la Malla, la Vista
--     previa y el Dashboard cuando ya están publicados como definitivos para la sucursal
--     de la trabajadora. El borrador publicado no les aparece.
--   • Quien tiene la casilla «Malla: Publicar» o la nueva «Malla: Ver borrador» (y las
--     cuentas admin) sigue viendo todo. Así se distingue a quien arma
--     los turnos (con la casilla) del administrador de sucursal (sin ella).
--   • El mes actual y los anteriores se ven como siempre.
--   • Lo que no se ve tampoco se puede editar.
--   • Mis turnos no cambia.
--   • Ajustes → Usuarios: cada cuenta puede tener un tipo (gerente de sucursal, jefe de
--     área o solo hace turnos), que se guarda en user_roles.tipo.
-- Solo agrega una columna y reemplaza funciones y reglas. Se puede volver a ejecutar sin error.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS tipo TEXT;

-- ¿Puede esta cuenta ver la malla de esa trabajadora en ese mes?
CREATE OR REPLACE FUNCTION public.can_see_month(p_worker_id TEXT, p_month_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_perm('malla_publicar')
    OR public.has_perm('malla_borrador')
    OR p_month_key <= to_char(now() AT TIME ZONE 'America/Santiago', 'YYYY-MM')
    OR EXISTS (
      SELECT 1 FROM public.published_schedules p
      JOIN public.workers w ON w.sucursal = p.sucursal
      WHERE w.id = p_worker_id AND p.month_key = p_month_key AND p.definitiva
    )
$$;
REVOKE ALL ON FUNCTION public.can_see_month(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_month(TEXT, TEXT) TO authenticated;

-- Turnos
DROP POLICY IF EXISTS schedule_data_read ON public.schedule_data;
CREATE POLICY schedule_data_read ON public.schedule_data FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id) AND public.can_see_month(worker_id, month_key));

DROP POLICY IF EXISTS schedule_data_insert ON public.schedule_data;
CREATE POLICY schedule_data_insert ON public.schedule_data FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

DROP POLICY IF EXISTS schedule_data_update ON public.schedule_data;
CREATE POLICY schedule_data_update ON public.schedule_data FOR UPDATE TO authenticated
  USING (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key))
  WITH CHECK (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

DROP POLICY IF EXISTS schedule_data_delete ON public.schedule_data;
CREATE POLICY schedule_data_delete ON public.schedule_data FOR DELETE TO authenticated
  USING (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

-- Días especiales (vacaciones, licencias, etc. marcados en la malla)
DROP POLICY IF EXISTS special_days_v2_read ON public.special_days_v2;
CREATE POLICY special_days_v2_read ON public.special_days_v2 FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id) AND public.can_see_month(worker_id, month_key));

DROP POLICY IF EXISTS special_days_v2_insert ON public.special_days_v2;
CREATE POLICY special_days_v2_insert ON public.special_days_v2 FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

DROP POLICY IF EXISTS special_days_v2_update ON public.special_days_v2;
CREATE POLICY special_days_v2_update ON public.special_days_v2 FOR UPDATE TO authenticated
  USING (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key))
  WITH CHECK (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

DROP POLICY IF EXISTS special_days_v2_delete ON public.special_days_v2;
CREATE POLICY special_days_v2_delete ON public.special_days_v2 FOR DELETE TO authenticated
  USING (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

-- Arrastre del último día al mes nuevo: solo en meses que esta cuenta puede ver
CREATE OR REPLACE FUNCTION public.carry_over_month(
  p_prev_month TEXT, p_new_month TEXT, p_last_day_index INTEGER)
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
    AND public.can_see_month(p.worker_id, p_new_month)
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
  RETURNING n.worker_id, n.days;
END $$;

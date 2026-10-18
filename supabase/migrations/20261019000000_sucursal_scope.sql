-- ─── Acceso por sucursal + escrituras sin pisarse ────────────────────────────
-- * user_roles.sucursales: NULL = todas las sucursales; si tiene valores, la persona
--   solo ve y (si es admin) solo edita esas sucursales.
-- * Ajustes globales (turnos, sucursales, áreas, cargos, tipos de día, usuarios) solo
--   los cambia un admin "general" (admin sin sucursales asignadas).
-- * Bloqueos de Malla/Asistencia y días bloqueados pasan a ser por sucursal.
-- * Asignaciones en bloque y arrastre de mes ahora son atómicas en la BD.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS sucursales TEXT[];

-- ─── Funciones de permiso ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.app_sucursales()
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sucursales FROM public.user_roles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'admin' AND (sucursales IS NULL OR cardinality(sucursales) = 0)
     FROM public.user_roles WHERE user_id = auth.uid()),
    false)
$$;

CREATE OR REPLACE FUNCTION public.in_my_sucursales(p_sucursal TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN s IS NULL OR cardinality(s) = 0 THEN true
    ELSE COALESCE(p_sucursal = ANY(s), false)
  END
  FROM (SELECT public.app_sucursales() AS s) x
$$;

CREATE OR REPLACE FUNCTION public.can_see_sucursal(p_sucursal TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.can_read() AND public.in_my_sucursales(p_sucursal) $$;

CREATE OR REPLACE FUNCTION public.can_edit_sucursal(p_sucursal TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_admin() AND public.in_my_sucursales(p_sucursal) $$;

-- in_my_sucursales(NULL) es true solo para quien no tiene sucursales asignadas (ve todas).
CREATE OR REPLACE FUNCTION public.can_see_worker(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_read() AND (
    public.in_my_sucursales(NULL)
    OR EXISTS (SELECT 1 FROM public.workers w WHERE w.id = p_worker_id AND public.in_my_sucursales(w.sucursal))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_worker(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_admin() AND (
    public.in_my_sucursales(NULL)
    OR EXISTS (SELECT 1 FROM public.workers w WHERE w.id = p_worker_id AND public.in_my_sucursales(w.sucursal))
  )
$$;

-- ─── Políticas ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  p RECORD;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workers', 'shifts', 'sucursales', 'areas', 'area_cargos', 'custom_non_working_types',
    'schedule_data', 'special_days', 'special_days_v2', 'app_settings', 'attendance_records',
    'overtime_hours', 'attendance_locked_dates', 'attendance_reports', 'rrhh_time_records'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  -- Configuración global: todos leen, solo el admin general modifica
  FOREACH t IN ARRAY ARRAY['shifts', 'sucursales', 'areas', 'area_cargos', 'custom_non_working_types'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_read())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_global_admin())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_global_admin()) WITH CHECK (public.is_global_admin())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_global_admin())', t || '_delete', t);
  END LOOP;

  -- Datos por trabajador: según la sucursal del trabajador
  FOREACH t IN ARRAY ARRAY['schedule_data', 'special_days', 'special_days_v2', 'attendance_records', 'overtime_hours'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_see_worker(worker_id))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_edit_worker(worker_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_edit_worker(worker_id)) WITH CHECK (public.can_edit_worker(worker_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_edit_worker(worker_id))', t || '_delete', t);
  END LOOP;
END $$;

-- Trabajadores: según su sucursal (también al moverlos de sucursal)
CREATE POLICY workers_read ON public.workers FOR SELECT TO authenticated
  USING (public.can_see_sucursal(sucursal));
CREATE POLICY workers_insert ON public.workers FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_sucursal(sucursal));
CREATE POLICY workers_update ON public.workers FOR UPDATE TO authenticated
  USING (public.can_edit_sucursal(sucursal)) WITH CHECK (public.can_edit_sucursal(sucursal));
CREATE POLICY workers_delete ON public.workers FOR DELETE TO authenticated
  USING (public.can_edit_sucursal(sucursal));

-- RRHH: solo administradores, y de sus sucursales
CREATE POLICY rrhh_time_records_read ON public.rrhh_time_records FOR SELECT TO authenticated
  USING (public.can_edit_worker(worker_id));
CREATE POLICY rrhh_time_records_insert ON public.rrhh_time_records FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_worker(worker_id));
CREATE POLICY rrhh_time_records_update ON public.rrhh_time_records FOR UPDATE TO authenticated
  USING (public.can_edit_worker(worker_id)) WITH CHECK (public.can_edit_worker(worker_id));
CREATE POLICY rrhh_time_records_delete ON public.rrhh_time_records FOR DELETE TO authenticated
  USING (public.can_edit_worker(worker_id));

-- Ajustes de la app (bloqueos "malla_locked:<sucursal>", "asistencia_locked:<sucursal>")
CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO authenticated
  USING (public.can_read());
CREATE POLICY app_settings_insert ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin() OR public.can_edit_sucursal(split_part(key, ':', 2)));
CREATE POLICY app_settings_update ON public.app_settings FOR UPDATE TO authenticated
  USING (public.is_global_admin() OR public.can_edit_sucursal(split_part(key, ':', 2)))
  WITH CHECK (public.is_global_admin() OR public.can_edit_sucursal(split_part(key, ':', 2)));
CREATE POLICY app_settings_delete ON public.app_settings FOR DELETE TO authenticated
  USING (public.is_global_admin());

-- Reportes de asistencia (tabla sin uso actual)
CREATE POLICY attendance_reports_read ON public.attendance_reports FOR SELECT TO authenticated
  USING (public.can_read());
CREATE POLICY attendance_reports_write ON public.attendance_reports FOR ALL TO authenticated
  USING (public.is_global_admin()) WITH CHECK (public.is_global_admin());

-- Usuarios: solo el admin general administra cuentas
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_global_admin());
DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
  USING (public.is_global_admin() AND user_id <> auth.uid())
  WITH CHECK (public.is_global_admin() AND user_id <> auth.uid());
DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;
CREATE POLICY user_roles_delete ON public.user_roles FOR DELETE TO authenticated
  USING (public.is_global_admin() AND user_id <> auth.uid());

-- ─── Días bloqueados por sucursal ────────────────────────────────────────────
ALTER TABLE public.attendance_locked_dates ADD COLUMN IF NOT EXISTS sucursal TEXT NOT NULL DEFAULT '';
ALTER TABLE public.attendance_locked_dates DROP CONSTRAINT IF EXISTS attendance_locked_dates_record_date_key;
DROP INDEX IF EXISTS public.attendance_locked_dates_record_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_locked_dates_date_sucursal
  ON public.attendance_locked_dates (record_date, sucursal);

CREATE POLICY attendance_locked_dates_read ON public.attendance_locked_dates FOR SELECT TO authenticated
  USING (public.can_see_sucursal(sucursal) OR sucursal = '');
CREATE POLICY attendance_locked_dates_insert ON public.attendance_locked_dates FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_sucursal(sucursal) AND sucursal <> '');
CREATE POLICY attendance_locked_dates_update ON public.attendance_locked_dates FOR UPDATE TO authenticated
  USING (public.can_edit_sucursal(sucursal) AND sucursal <> '')
  WITH CHECK (public.can_edit_sucursal(sucursal) AND sucursal <> '');
CREATE POLICY attendance_locked_dates_delete ON public.attendance_locked_dates FOR DELETE TO authenticated
  USING (public.can_edit_sucursal(sucursal) OR (sucursal = '' AND public.is_global_admin()));

-- Un día bloqueado de una sucursal solo bloquea a los trabajadores de esa sucursal
-- (sucursal '' = bloqueos antiguos, aplican a todas).
CREATE OR REPLACE FUNCTION public.reject_locked_attendance_date()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d   TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.record_date::text ELSE NEW.record_date::text END;
  wid TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.worker_id ELSE NEW.worker_id END;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.attendance_locked_dates l
    WHERE l.record_date = d
      AND (l.sucursal = '' OR l.sucursal = (SELECT w.sucursal FROM public.workers w WHERE w.id = wid))
  ) THEN
    RAISE EXCEPTION 'El día % está bloqueado. Desbloquéalo para modificarlo.', d;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- ─── Escrituras en bloque atómicas ───────────────────────────────────────────
-- Asigna el mismo turno a varios días de un trabajador, saltando los días con día especial.
CREATE OR REPLACE FUNCTION public.set_schedule_cells(
  p_month_key TEXT, p_worker_id TEXT, p_day_indices INT[], p_shift TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_days JSONB;
  v_special JSONB;
  i INT;
BEGIN
  INSERT INTO public.schedule_data (month_key, worker_id, days)
  VALUES (p_month_key, p_worker_id, (SELECT jsonb_agg(NULL::text) FROM generate_series(1, 31)))
  ON CONFLICT (month_key, worker_id) DO NOTHING;

  SELECT days INTO v_days FROM public.schedule_data
  WHERE month_key = p_month_key AND worker_id = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin permiso para editar la malla de este trabajador';
  END IF;

  SELECT days INTO v_special FROM public.special_days_v2
  WHERE month_key = p_month_key AND worker_id = p_worker_id;

  IF v_days IS NULL OR jsonb_typeof(v_days) <> 'array' THEN v_days := '[]'::jsonb; END IF;
  WHILE jsonb_array_length(v_days) < 31 LOOP v_days := v_days || 'null'::jsonb; END LOOP;

  FOREACH i IN ARRAY p_day_indices LOOP
    IF i < 0 OR i > 30 THEN CONTINUE; END IF;
    IF v_special IS NOT NULL AND v_special ? i::text THEN CONTINUE; END IF;
    v_days := jsonb_set(v_days, ARRAY[i::text], COALESCE(to_jsonb(p_shift), 'null'::jsonb));
  END LOOP;

  UPDATE public.schedule_data SET days = v_days, updated_at = now()
  WHERE month_key = p_month_key AND worker_id = p_worker_id;
  RETURN v_days;
END $$;

-- Asigna o quita un día especial en varios días de un trabajador (y limpia esos turnos).
CREATE OR REPLACE FUNCTION public.set_special_day_cells(
  p_month_key TEXT, p_worker_id TEXT, p_day_indices INT[], p_type_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_days JSONB;
  v_sched JSONB;
  i INT;
BEGIN
  INSERT INTO public.special_days_v2 (month_key, worker_id, days)
  VALUES (p_month_key, p_worker_id, '{}'::jsonb)
  ON CONFLICT (month_key, worker_id) DO NOTHING;

  SELECT COALESCE(days, '{}'::jsonb) INTO v_days FROM public.special_days_v2
  WHERE month_key = p_month_key AND worker_id = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sin permiso para editar la malla de este trabajador';
  END IF;

  FOREACH i IN ARRAY p_day_indices LOOP
    IF i < 0 OR i > 30 THEN CONTINUE; END IF;
    IF p_type_code IS NULL THEN
      v_days := v_days - i::text;
    ELSE
      v_days := v_days || jsonb_build_object(i::text, p_type_code);
    END IF;
  END LOOP;

  UPDATE public.special_days_v2 SET days = v_days, updated_at = now()
  WHERE month_key = p_month_key AND worker_id = p_worker_id;

  IF p_type_code IS NOT NULL THEN
    SELECT days INTO v_sched FROM public.schedule_data
    WHERE month_key = p_month_key AND worker_id = p_worker_id
    FOR UPDATE;
    IF FOUND AND jsonb_typeof(v_sched) = 'array' THEN
      FOREACH i IN ARRAY p_day_indices LOOP
        IF i >= 0 AND i < jsonb_array_length(v_sched) THEN
          v_sched := jsonb_set(v_sched, ARRAY[i::text], 'null'::jsonb);
        END IF;
      END LOOP;
      UPDATE public.schedule_data SET days = v_sched, updated_at = now()
      WHERE month_key = p_month_key AND worker_id = p_worker_id;
    END IF;
  END IF;

  RETURN v_days;
END $$;

-- Arrastre de mes: copia el turno del último día del mes anterior al día 1 del mes nuevo,
-- solo si ese día 1 está vacío y sin día especial. Solo trabajadores que el usuario puede editar.
CREATE OR REPLACE FUNCTION public.carry_over_month(
  p_prev_month TEXT, p_new_month TEXT, p_last_day_index INT
)
RETURNS TABLE (r_worker_id TEXT, r_days JSONB)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.schedule_data (month_key, worker_id, days)
  SELECT p_new_month, p.worker_id, (SELECT jsonb_agg(NULL::text) FROM generate_series(1, 31))
  FROM public.schedule_data p
  WHERE p.month_key = p_prev_month
    AND COALESCE(p.days ->> p_last_day_index, 'DESC') <> 'DESC'
    AND public.can_edit_worker(p.worker_id)
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

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.app_sucursales(), public.is_global_admin(), public.in_my_sucursales(TEXT),
  public.can_see_sucursal(TEXT), public.can_edit_sucursal(TEXT),
  public.can_see_worker(TEXT), public.can_edit_worker(TEXT),
  public.set_schedule_cells(TEXT, TEXT, INT[], TEXT),
  public.set_special_day_cells(TEXT, TEXT, INT[], TEXT),
  public.carry_over_month(TEXT, TEXT, INT),
  public.reject_locked_attendance_date()
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.app_sucursales(), public.is_global_admin(), public.in_my_sucursales(TEXT),
  public.can_see_sucursal(TEXT), public.can_edit_sucursal(TEXT),
  public.can_see_worker(TEXT), public.can_edit_worker(TEXT),
  public.set_schedule_cells(TEXT, TEXT, INT[], TEXT),
  public.set_special_day_cells(TEXT, TEXT, INT[], TEXT),
  public.carry_over_month(TEXT, TEXT, INT)
TO authenticated;

-- Realtime: bloqueos de días y asistencia también en vivo
DO $$
DECLARE t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN RETURN; END IF;
  FOREACH t IN ARRAY ARRAY['attendance_locked_dates'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

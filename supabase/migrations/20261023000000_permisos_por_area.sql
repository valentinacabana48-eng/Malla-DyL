-- ─── Permisos por sucursal, área, cargo y módulo ─────────────────────────────
-- Cada usuario tiene:
--   * Alcance: sucursales, áreas y cargos que ve (NULL = todos).
--   * Qué puede hacer: según su rol.
--       admin         → todo en su alcance (sin alcance = administración general).
--       lector        → ver malla, personal y asistencia.
--       asistencia    → ver malla y asistencia, y marcar asistencia por aprobar.
--       personalizado → lo que diga user_roles.permisos.
-- Permisos: malla_ver, malla_editar, malla_publicar, personal_ver, personal_editar,
--           asistencia_ver, asistencia_marcar, asistencia_aprobar, horas_extra, rrhh.
-- Los ajustes globales (turnos compartidos, sucursales, áreas, cargos, usuarios) siguen
-- siendo solo de la administración general.

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'lector', 'asistencia', 'personalizado', 'pendiente'));

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS areas TEXT[];
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS cargos TEXT[];
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS permisos TEXT[];

-- ─── Funciones de permiso ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_perm(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE r.role
      WHEN 'admin' THEN true
      WHEN 'lector' THEN p_perm IN ('malla_ver', 'personal_ver', 'asistencia_ver')
      WHEN 'asistencia' THEN p_perm IN ('malla_ver', 'asistencia_ver', 'asistencia_marcar')
      WHEN 'personalizado' THEN p_perm = ANY(COALESCE(r.permisos, '{}'))
      ELSE false
    END
    FROM public.user_roles r WHERE r.user_id = auth.uid()
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_read()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() IN ('admin', 'lector', 'asistencia', 'personalizado'), false)
$$;

-- Sin ninguna restricción de alcance (ve todas las sucursales, áreas y cargos)
CREATE OR REPLACE FUNCTION public.has_full_scope()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (sucursales IS NULL OR cardinality(sucursales) = 0)
       AND (areas IS NULL OR cardinality(areas) = 0)
       AND (cargos IS NULL OR cardinality(cargos) = 0)
    FROM public.user_roles WHERE user_id = auth.uid()
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() = 'admin', false) AND public.has_full_scope()
$$;

CREATE OR REPLACE FUNCTION public.in_my_areas(p_area TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT areas IS NULL OR cardinality(areas) = 0 OR COALESCE(p_area = ANY(areas), false)
    FROM public.user_roles WHERE user_id = auth.uid()
  ), false)
$$;

-- Ahora los cargos limitan a cualquier usuario (antes solo al nivel asistencia)
CREATE OR REPLACE FUNCTION public.in_my_cargos(p_cargo TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT cargos IS NULL OR cardinality(cargos) = 0 OR COALESCE(p_cargo = ANY(cargos), false)
    FROM public.user_roles WHERE user_id = auth.uid()
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.in_my_scope(p_sucursal TEXT, p_area TEXT, p_cargo TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.in_my_sucursales(p_sucursal) AND public.in_my_areas(p_area) AND public.in_my_cargos(p_cargo)
$$;

-- El trabajador está dentro del alcance (sin restricciones también cuenta uno que ya no existe)
CREATE OR REPLACE FUNCTION public.worker_in_scope(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_full_scope()
    OR EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = p_worker_id AND public.in_my_scope(w.sucursal, w.area, w.cargo)
    )
$$;

CREATE OR REPLACE FUNCTION public.can_worker(p_worker_id TEXT, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_perm(p_perm) AND public.worker_in_scope(p_worker_id) $$;

CREATE OR REPLACE FUNCTION public.can_see_worker(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.can_read() AND public.worker_in_scope(p_worker_id) $$;

-- Editar la malla de este trabajador
CREATE OR REPLACE FUNCTION public.can_edit_worker(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.can_worker(p_worker_id, 'malla_editar') $$;

-- Maneja la sucursal completa (bloqueos de toda la sucursal, turnos propios de la sucursal):
-- edita la malla y no tiene limitadas las áreas ni los cargos
CREATE OR REPLACE FUNCTION public.can_edit_sucursal(p_sucursal TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_perm('malla_editar') AND public.in_my_sucursales(p_sucursal)
    AND COALESCE((
      SELECT (areas IS NULL OR cardinality(areas) = 0) AND (cargos IS NULL OR cardinality(cargos) = 0)
      FROM public.user_roles WHERE user_id = auth.uid()
    ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_propose_attendance(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_worker(p_worker_id, 'asistencia_marcar')
      OR public.can_worker(p_worker_id, 'asistencia_aprobar')
$$;

-- ─── Políticas ───────────────────────────────────────────────────────────────
-- Personal
DROP POLICY IF EXISTS workers_read ON public.workers;
DROP POLICY IF EXISTS workers_insert ON public.workers;
DROP POLICY IF EXISTS workers_update ON public.workers;
DROP POLICY IF EXISTS workers_delete ON public.workers;
CREATE POLICY workers_read ON public.workers FOR SELECT TO authenticated
  USING (public.can_read() AND public.in_my_scope(sucursal, area, cargo));
CREATE POLICY workers_insert ON public.workers FOR INSERT TO authenticated
  WITH CHECK (public.has_perm('personal_editar') AND public.in_my_scope(sucursal, area, cargo));
CREATE POLICY workers_update ON public.workers FOR UPDATE TO authenticated
  USING (public.has_perm('personal_editar') AND public.in_my_scope(sucursal, area, cargo))
  WITH CHECK (public.has_perm('personal_editar') AND public.in_my_scope(sucursal, area, cargo));
CREATE POLICY workers_delete ON public.workers FOR DELETE TO authenticated
  USING (public.has_perm('personal_editar') AND public.in_my_scope(sucursal, area, cargo));

-- Malla (schedule_data, special_days, special_days_v2) sigue con can_edit_worker = malla_editar.

-- Asistencia oficial: quien aprueba (o administra)
DROP POLICY IF EXISTS attendance_records_insert ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_update ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_delete ON public.attendance_records;
CREATE POLICY attendance_records_insert ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.can_worker(worker_id, 'asistencia_aprobar'));
CREATE POLICY attendance_records_update ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.can_worker(worker_id, 'asistencia_aprobar'))
  WITH CHECK (public.can_worker(worker_id, 'asistencia_aprobar'));
CREATE POLICY attendance_records_delete ON public.attendance_records FOR DELETE TO authenticated
  USING (public.can_worker(worker_id, 'asistencia_aprobar'));

-- Horas extra
DROP POLICY IF EXISTS overtime_hours_insert ON public.overtime_hours;
DROP POLICY IF EXISTS overtime_hours_update ON public.overtime_hours;
DROP POLICY IF EXISTS overtime_hours_delete ON public.overtime_hours;
CREATE POLICY overtime_hours_insert ON public.overtime_hours FOR INSERT TO authenticated
  WITH CHECK (public.can_worker(worker_id, 'horas_extra'));
CREATE POLICY overtime_hours_update ON public.overtime_hours FOR UPDATE TO authenticated
  USING (public.can_worker(worker_id, 'horas_extra'))
  WITH CHECK (public.can_worker(worker_id, 'horas_extra'));
CREATE POLICY overtime_hours_delete ON public.overtime_hours FOR DELETE TO authenticated
  USING (public.can_worker(worker_id, 'horas_extra'));

-- RRHH
DROP POLICY IF EXISTS rrhh_time_records_read ON public.rrhh_time_records;
DROP POLICY IF EXISTS rrhh_time_records_insert ON public.rrhh_time_records;
DROP POLICY IF EXISTS rrhh_time_records_update ON public.rrhh_time_records;
DROP POLICY IF EXISTS rrhh_time_records_delete ON public.rrhh_time_records;
CREATE POLICY rrhh_time_records_read ON public.rrhh_time_records FOR SELECT TO authenticated
  USING (public.can_worker(worker_id, 'rrhh'));
CREATE POLICY rrhh_time_records_insert ON public.rrhh_time_records FOR INSERT TO authenticated
  WITH CHECK (public.can_worker(worker_id, 'rrhh'));
CREATE POLICY rrhh_time_records_update ON public.rrhh_time_records FOR UPDATE TO authenticated
  USING (public.can_worker(worker_id, 'rrhh')) WITH CHECK (public.can_worker(worker_id, 'rrhh'));
CREATE POLICY rrhh_time_records_delete ON public.rrhh_time_records FOR DELETE TO authenticated
  USING (public.can_worker(worker_id, 'rrhh'));

-- Malla publicada: cada una ve solo a las trabajadoras de su alcance
DROP POLICY IF EXISTS published_schedule_days_read ON public.published_schedule_days;
CREATE POLICY published_schedule_days_read ON public.published_schedule_days
  FOR SELECT TO authenticated USING (public.can_see_sucursal(sucursal) AND public.can_see_worker(worker_id));

-- ─── Días bloqueados por sucursal y área ─────────────────────────────────────
-- area '' = toda la sucursal (los bloqueos que ya existían)
ALTER TABLE public.attendance_locked_dates ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS public.attendance_locked_dates_date_sucursal;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_locked_dates_date_sucursal_area
  ON public.attendance_locked_dates (record_date, sucursal, area);

-- Bloquear o desbloquear: quien aprueba asistencia en esa sucursal; un área solo si la ve
CREATE OR REPLACE FUNCTION public.can_lock_attendance(p_sucursal TEXT, p_area TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_perm('asistencia_aprobar') AND p_sucursal <> ''
    AND public.in_my_sucursales(p_sucursal)
    AND (CASE WHEN p_area = '' THEN public.can_edit_sucursal(p_sucursal) OR public.is_global_admin()
              ELSE public.in_my_areas(p_area) END)
$$;

DROP POLICY IF EXISTS attendance_locked_dates_insert ON public.attendance_locked_dates;
DROP POLICY IF EXISTS attendance_locked_dates_update ON public.attendance_locked_dates;
DROP POLICY IF EXISTS attendance_locked_dates_delete ON public.attendance_locked_dates;
CREATE POLICY attendance_locked_dates_insert ON public.attendance_locked_dates FOR INSERT TO authenticated
  WITH CHECK (public.can_lock_attendance(sucursal, area));
CREATE POLICY attendance_locked_dates_update ON public.attendance_locked_dates FOR UPDATE TO authenticated
  USING (public.can_lock_attendance(sucursal, area))
  WITH CHECK (public.can_lock_attendance(sucursal, area));
CREATE POLICY attendance_locked_dates_delete ON public.attendance_locked_dates FOR DELETE TO authenticated
  USING (public.can_lock_attendance(sucursal, area) OR (sucursal = '' AND public.is_global_admin()));

CREATE OR REPLACE FUNCTION public.reject_locked_attendance_date()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  d   TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.record_date::text ELSE NEW.record_date::text END;
  wid TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.worker_id ELSE NEW.worker_id END;
  w   RECORD;
BEGIN
  SELECT sucursal, area INTO w FROM public.workers WHERE id = wid;
  IF EXISTS (
    SELECT 1 FROM public.attendance_locked_dates l
    WHERE l.record_date = d
      AND (l.sucursal = '' OR l.sucursal = w.sucursal)
      AND (l.area = '' OR l.area = w.area)
  ) THEN
    RAISE EXCEPTION 'El día % está bloqueado. Desbloquéalo para modificarlo.', d;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- ─── Aprobar asistencia: solo lo que esta persona puede aprobar ──────────────
-- Bloquea el día de cada sucursal y área aprobada.
CREATE OR REPLACE FUNCTION public.approve_attendance_day(p_date TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  n      INT;
  v_ids  TEXT[];
BEGIN
  IF NOT public.has_perm('asistencia_aprobar') THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar la asistencia.';
  END IF;

  SELECT COALESCE(array_agg(p.worker_id), '{}') INTO v_ids
  FROM public.attendance_proposals p
  WHERE p.record_date = p_date AND public.can_worker(p.worker_id, 'asistencia_aprobar');

  INSERT INTO public.attendance_records
    (worker_id, record_date, period_key, status, absence_reason, notes, retiro_horas, retiro_motivo, updated_at)
  SELECT p.worker_id, p.record_date, p.period_key, p.status, p.absence_reason, p.notes,
         p.retiro_horas, p.retiro_motivo, now()
  FROM public.attendance_proposals p
  WHERE p.record_date = p_date AND p.worker_id = ANY(v_ids)
  ON CONFLICT (worker_id, record_date) DO UPDATE SET
    status = EXCLUDED.status,
    absence_reason = EXCLUDED.absence_reason,
    notes = EXCLUDED.notes,
    retiro_horas = EXCLUDED.retiro_horas,
    retiro_motivo = EXCLUDED.retiro_motivo,
    updated_at = now();
  GET DIAGNOSTICS n = ROW_COUNT;

  DELETE FROM public.attendance_proposals
  WHERE record_date = p_date AND worker_id = ANY(v_ids);

  INSERT INTO public.attendance_locked_dates (record_date, sucursal, area)
  SELECT DISTINCT p_date, w.sucursal, w.area
  FROM public.workers w
  WHERE w.id = ANY(v_ids) AND w.sucursal <> ''
  ON CONFLICT (record_date, sucursal, area) DO NOTHING;

  RETURN n;
END $$;

-- ─── Claves de Mis turnos: quien edita personal ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_worker_pin(p_worker_id TEXT, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.can_worker(p_worker_id, 'personal_editar') THEN
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
  WHERE p.worker_id = ANY(p_worker_ids) AND public.can_worker(p.worker_id, 'personal_editar')
$$;

-- ─── Publicar: solo las trabajadoras que esta persona puede publicar ─────────
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
  IF NOT (public.has_perm('malla_publicar') AND public.in_my_sucursales(p_sucursal)) THEN
    RAISE EXCEPTION 'Sin permiso para publicar la malla de %', p_sucursal;
  END IF;
  IF p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido: %', p_month_key;
  END IF;

  -- Dos personas publicando la misma malla a la vez: una espera a la otra
  PERFORM pg_advisory_xact_lock(hashtext('publish:' || p_month_key || ':' || p_sucursal));

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

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.has_perm(TEXT), public.has_full_scope(), public.in_my_areas(TEXT),
  public.in_my_scope(TEXT, TEXT, TEXT), public.worker_in_scope(TEXT),
  public.can_worker(TEXT, TEXT), public.can_lock_attendance(TEXT, TEXT)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.has_perm(TEXT), public.has_full_scope(), public.in_my_areas(TEXT),
  public.in_my_scope(TEXT, TEXT, TEXT), public.worker_in_scope(TEXT),
  public.can_worker(TEXT, TEXT), public.can_lock_attendance(TEXT, TEXT)
TO authenticated;

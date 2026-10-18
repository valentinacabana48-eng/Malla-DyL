-- ─── Seguridad: login real + roles + RLS cerrado ────────────────────────────
-- Reemplaza el acceso abierto (USING true) por:
--   * lectura  → usuarios autenticados con rol 'admin' o 'lector'
--   * escritura → solo 'admin'
--   * RRHH     → solo 'admin' (lectura y escritura)
-- No borra datos de negocio. Solo elimina la tabla pin_settings (PINs en texto plano).

-- ─── Roles de usuario ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'pendiente' CHECK (role IN ('admin', 'lector', 'pendiente')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER para que las políticas puedan consultar user_roles sin recursión.
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() = 'admin', false)
$$;

CREATE OR REPLACE FUNCTION public.can_read()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() IN ('admin', 'lector'), false)
$$;

-- Cada usuario nuevo queda 'pendiente' hasta que un admin lo apruebe.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, email)
  VALUES (NEW.id, COALESCE(NEW.email, ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Usuarios que ya existían
INSERT INTO public.user_roles (user_id, email)
SELECT id, COALESCE(email, '') FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Un admin no puede quitarse el rol a sí mismo (evita quedar sin administradores).
DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
CREATE POLICY user_roles_update ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND user_id <> auth.uid())
  WITH CHECK (public.is_admin() AND user_id <> auth.uid());

DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;
CREATE POLICY user_roles_delete ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.is_admin() AND user_id <> auth.uid());

-- ─── Reemplazar todas las políticas abiertas ─────────────────────────────────
DO $$
DECLARE
  t TEXT;
  p RECORD;
  read_check TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workers', 'shifts', 'sucursales', 'areas', 'area_cargos',
    'custom_non_working_types', 'schedule_data', 'special_days', 'special_days_v2',
    'app_settings', 'attendance_records', 'overtime_hours', 'attendance_locked_dates',
    'attendance_reports', 'rrhh_time_records'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    read_check := CASE WHEN t = 'rrhh_time_records' THEN 'public.is_admin()' ELSE 'public.can_read()' END;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s)', t || '_read', t, read_check);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_admin())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_admin())', t || '_delete', t);
  END LOOP;
END $$;

-- ─── Los PINs ya no se usan ──────────────────────────────────────────────────
DROP TABLE IF EXISTS public.pin_settings;

-- ─── Días bloqueados: la base de datos también los respeta ───────────────────
CREATE OR REPLACE FUNCTION public.reject_locked_attendance_date()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  d TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.record_date::text ELSE NEW.record_date::text END;
BEGIN
  IF EXISTS (SELECT 1 FROM public.attendance_locked_dates WHERE record_date = d) THEN
    RAISE EXCEPTION 'El día % está bloqueado. Desbloquéalo para modificarlo.', d;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS attendance_records_locked ON public.attendance_records;
CREATE TRIGGER attendance_records_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_attendance_date();

DROP TRIGGER IF EXISTS overtime_hours_locked ON public.overtime_hours;
CREATE TRIGGER overtime_hours_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.overtime_hours
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_attendance_date();

-- ─── Escritura atómica de una celda (evita que dos ediciones se pisen) ───────
-- SECURITY INVOKER: aplica RLS del usuario (solo admin puede escribir).
CREATE OR REPLACE FUNCTION public.set_schedule_cell(
  p_month_key TEXT, p_worker_id TEXT, p_day_index INT, p_shift TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_days JSONB;
BEGIN
  IF p_day_index < 0 OR p_day_index > 30 THEN
    RAISE EXCEPTION 'day_index fuera de rango: %', p_day_index;
  END IF;

  INSERT INTO public.schedule_data (month_key, worker_id, days)
  VALUES (p_month_key, p_worker_id, (SELECT jsonb_agg(NULL::text) FROM generate_series(1, 31)))
  ON CONFLICT (month_key, worker_id) DO NOTHING;

  SELECT days INTO v_days FROM public.schedule_data
  WHERE month_key = p_month_key AND worker_id = p_worker_id
  FOR UPDATE;

  IF v_days IS NULL OR jsonb_typeof(v_days) <> 'array' THEN
    v_days := '[]'::jsonb;
  END IF;
  WHILE jsonb_array_length(v_days) < 31 LOOP
    v_days := v_days || 'null'::jsonb;
  END LOOP;

  v_days := jsonb_set(v_days, ARRAY[p_day_index::text], COALESCE(to_jsonb(p_shift), 'null'::jsonb));

  UPDATE public.schedule_data SET days = v_days, updated_at = now()
  WHERE month_key = p_month_key AND worker_id = p_worker_id;

  RETURN v_days;
END $$;

-- Asigna o quita un día especial y, si se asigna, limpia el turno de esa celda.
CREATE OR REPLACE FUNCTION public.set_special_day_cell(
  p_month_key TEXT, p_worker_id TEXT, p_day_index INT, p_type_code TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_days JSONB;
BEGIN
  IF p_day_index < 0 OR p_day_index > 30 THEN
    RAISE EXCEPTION 'day_index fuera de rango: %', p_day_index;
  END IF;

  INSERT INTO public.special_days_v2 (month_key, worker_id, days)
  VALUES (p_month_key, p_worker_id, '{}'::jsonb)
  ON CONFLICT (month_key, worker_id) DO NOTHING;

  UPDATE public.special_days_v2
  SET days = CASE
               WHEN p_type_code IS NULL THEN COALESCE(days, '{}'::jsonb) - p_day_index::text
               ELSE COALESCE(days, '{}'::jsonb) || jsonb_build_object(p_day_index::text, p_type_code)
             END,
      updated_at = now()
  WHERE month_key = p_month_key AND worker_id = p_worker_id
  RETURNING days INTO v_days;

  IF p_type_code IS NOT NULL THEN
    PERFORM public.set_schedule_cell(p_month_key, p_worker_id, p_day_index, NULL);
  END IF;

  RETURN v_days;
END $$;

-- Al borrar un tipo de día especial, quitarlo de todas las mallas.
CREATE OR REPLACE FUNCTION public.remove_special_day_type(p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  UPDATE public.special_days_v2
  SET days = COALESCE(
        (SELECT jsonb_object_agg(key, value) FROM jsonb_each(days) WHERE value <> to_jsonb(p_code)),
        '{}'::jsonb),
      updated_at = now()
  WHERE EXISTS (SELECT 1 FROM jsonb_each_text(days) WHERE value = p_code);

  DELETE FROM public.special_days WHERE type_code = p_code;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_schedule_cell(TEXT, TEXT, INT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_special_day_cell(TEXT, TEXT, INT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_special_day_type(TEXT) FROM anon;

-- Realtime: que los eventos DELETE incluyan month_key / worker_id.
ALTER TABLE public.schedule_data REPLICA IDENTITY FULL;
ALTER TABLE public.special_days_v2 REPLICA IDENTITY FULL;

-- Realtime: publicar los cambios para que se vean al instante en todos los dispositivos
-- (Supabase respeta RLS: cada usuario solo recibe lo que puede leer).
DO $$
DECLARE t TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  FOREACH t IN ARRAY ARRAY['schedule_data', 'special_days_v2', 'workers', 'shifts', 'app_settings'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ─── Primer administrador ────────────────────────────────────────────────────
-- Después de crear tu cuenta en la app, ejecuta en el SQL Editor de Supabase:
--   UPDATE public.user_roles SET role = 'admin' WHERE email = 'tu-correo@ejemplo.com';

-- ─── Horas extra por aprobar + nombre de cada usuario ───────────────────────
-- * Horas extra: quien tiene "Anotar" las deja por aprobar; quien tiene "Aprobar"
--   las deja aprobadas al anotarlas o al aprobar el día. Las que ya existían quedan aprobadas.
-- * Usuarios: se guarda el nombre (se pide al crear la cuenta; la administración lo puede editar).
-- Se puede volver a ejecutar sin error.

-- ─── Horas extra ─────────────────────────────────────────────────────────────
ALTER TABLE public.overtime_hours ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'aprobada';
ALTER TABLE public.overtime_hours ADD COLUMN IF NOT EXISTS proposed_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.overtime_hours ADD COLUMN IF NOT EXISTS approved_by_email TEXT NOT NULL DEFAULT '';
ALTER TABLE public.overtime_hours ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE public.overtime_hours DROP CONSTRAINT IF EXISTS overtime_hours_status_check;
ALTER TABLE public.overtime_hours ADD CONSTRAINT overtime_hours_status_check
  CHECK (status IN ('pendiente', 'aprobada'));

-- Quién la anotó y si queda aprobada (lo decide la base de datos, no la app)
CREATE OR REPLACE FUNCTION public.overtime_hours_approval()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW; -- cambios hechos desde el SQL Editor
  END IF;
  v_email := COALESCE((SELECT email FROM public.user_roles WHERE user_id = auth.uid()), '');

  IF TG_OP = 'INSERT' OR NEW.hours IS DISTINCT FROM OLD.hours OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    NEW.proposed_by_email := v_email;
  END IF;

  IF public.can_worker(NEW.worker_id, 'horas_extra_aprobar') THEN
    IF TG_OP = 'INSERT' OR OLD.status <> 'aprobada'
       OR NEW.hours IS DISTINCT FROM OLD.hours OR NEW.notes IS DISTINCT FROM OLD.notes THEN
      NEW.approved_by_email := v_email;
      NEW.approved_at := now();
    END IF;
    NEW.status := 'aprobada';
  ELSE
    NEW.status := 'pendiente';
    NEW.approved_by_email := '';
    NEW.approved_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS overtime_hours_approval ON public.overtime_hours;
CREATE TRIGGER overtime_hours_approval
  BEFORE INSERT OR UPDATE ON public.overtime_hours
  FOR EACH ROW EXECUTE FUNCTION public.overtime_hours_approval();

-- Anotar o aprobar horas extra
DROP POLICY IF EXISTS overtime_hours_insert ON public.overtime_hours;
DROP POLICY IF EXISTS overtime_hours_update ON public.overtime_hours;
DROP POLICY IF EXISTS overtime_hours_delete ON public.overtime_hours;
CREATE POLICY overtime_hours_insert ON public.overtime_hours FOR INSERT TO authenticated
  WITH CHECK (public.can_worker(worker_id, 'horas_extra') OR public.can_worker(worker_id, 'horas_extra_aprobar'));
CREATE POLICY overtime_hours_update ON public.overtime_hours FOR UPDATE TO authenticated
  USING (public.can_worker(worker_id, 'horas_extra') OR public.can_worker(worker_id, 'horas_extra_aprobar'))
  WITH CHECK (public.can_worker(worker_id, 'horas_extra') OR public.can_worker(worker_id, 'horas_extra_aprobar'));
CREATE POLICY overtime_hours_delete ON public.overtime_hours FOR DELETE TO authenticated
  USING (public.can_worker(worker_id, 'horas_extra') OR public.can_worker(worker_id, 'horas_extra_aprobar'));

-- Aprobar el día: la asistencia marcada y las horas extra por aprobar.
-- Bloquea el día en las áreas aprobadas (donde se pueda bloquear).
CREATE OR REPLACE FUNCTION public.approve_attendance_day(p_date TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  n      INT := 0;
  n_he   INT := 0;
  v_ids  TEXT[];
  v_he   TEXT[];
BEGIN
  IF NOT (public.has_perm('asistencia_aprobar') OR public.has_perm('horas_extra_aprobar')) THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar la asistencia.';
  END IF;

  -- Horas extra (antes de bloquear el día)
  SELECT COALESCE(array_agg(o.worker_id), '{}') INTO v_he
  FROM public.overtime_hours o
  WHERE o.record_date = p_date AND o.status = 'pendiente'
    AND public.can_worker(o.worker_id, 'horas_extra_aprobar');

  UPDATE public.overtime_hours SET status = 'aprobada'
  WHERE record_date = p_date AND worker_id = ANY(v_he);
  GET DIAGNOSTICS n_he = ROW_COUNT;

  -- Asistencia marcada
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
  WHERE w.id = ANY(v_ids || v_he) AND w.sucursal <> ''
    AND public.can_lock_attendance(w.sucursal, w.area)
  ON CONFLICT (record_date, sucursal, area) DO NOTHING;

  RETURN n + n_he;
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_attendance_day(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_attendance_day(TEXT) TO authenticated;

-- ─── Nombre de cada usuario ──────────────────────────────────────────────────
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS nombre TEXT NOT NULL DEFAULT '';

-- Cuentas nuevas: el nombre viene del formulario de registro
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, email, nombre)
  VALUES (NEW.id, COALESCE(NEW.email, ''), left(trim(COALESCE(NEW.raw_user_meta_data->>'nombre', '')), 80))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

-- Cuentas que ya existían y que tenían nombre al registrarse
UPDATE public.user_roles r
SET nombre = left(trim(u.raw_user_meta_data->>'nombre'), 80)
FROM auth.users u
WHERE u.id = r.user_id AND r.nombre = '' AND COALESCE(trim(u.raw_user_meta_data->>'nombre'), '') <> '';

-- Cada persona puede cambiar su propio nombre (solo el nombre)
CREATE OR REPLACE FUNCTION public.set_my_name(p_nombre TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE public.user_roles SET nombre = left(trim(COALESCE(p_nombre, '')), 80), updated_at = now()
  WHERE user_id = auth.uid()
$$;

REVOKE EXECUTE ON FUNCTION public.set_my_name(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_name(TEXT) TO authenticated;

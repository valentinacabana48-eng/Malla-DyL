-- ─── Nivel "Asistencia" (jefas de caja) con aprobación ──────────────────────
-- * Ve solo los cargos que se le asignan (user_roles.cargos; NULL = todos) de sus sucursales.
-- * Marca la asistencia como propuesta (attendance_proposals): no cuenta hasta que una
--   administradora la aprueba. Al aprobar se guarda en attendance_records y el día se bloquea.
-- * No anota horas extra, no bloquea días y no cambia malla, personal, RRHH ni ajustes.

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'lector', 'asistencia', 'pendiente'));

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS cargos TEXT[];

CREATE OR REPLACE FUNCTION public.can_read()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() IN ('admin', 'lector', 'asistencia'), false)
$$;

-- Cargos que puede ver esta persona. Solo limita al nivel "asistencia".
CREATE OR REPLACE FUNCTION public.in_my_cargos(p_cargo TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT role <> 'asistencia' OR cargos IS NULL OR cardinality(cargos) = 0
           OR COALESCE(p_cargo = ANY(cargos), false)
    FROM public.user_roles WHERE user_id = auth.uid()
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.can_see_worker(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_read() AND (
    (public.in_my_sucursales(NULL) AND public.app_role() <> 'asistencia')
    OR EXISTS (
      SELECT 1 FROM public.workers w
      WHERE w.id = p_worker_id AND public.in_my_sucursales(w.sucursal) AND public.in_my_cargos(w.cargo)
    )
  )
$$;

DROP POLICY IF EXISTS workers_read ON public.workers;
CREATE POLICY workers_read ON public.workers FOR SELECT TO authenticated
  USING (public.can_see_sucursal(sucursal) AND public.in_my_cargos(cargo));

-- Puede proponer asistencia: admin de la sucursal, o nivel asistencia que ve a ese trabajador
CREATE OR REPLACE FUNCTION public.can_propose_attendance(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.can_edit_worker(p_worker_id)
    OR (COALESCE(public.app_role() = 'asistencia', false) AND public.can_see_worker(p_worker_id))
$$;

REVOKE EXECUTE ON FUNCTION public.in_my_cargos(TEXT), public.can_propose_attendance(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_my_cargos(TEXT), public.can_propose_attendance(TEXT) TO authenticated;

-- ─── Asistencia por aprobar ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attendance_proposals (
  worker_id         TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  record_date       TEXT NOT NULL,
  period_key        TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL,
  absence_reason    TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  retiro_horas      NUMERIC(4,1) NOT NULL DEFAULT 0,
  retiro_motivo     TEXT NOT NULL DEFAULT '',
  proposed_by       UUID,
  proposed_by_email TEXT NOT NULL DEFAULT '',
  updated_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (worker_id, record_date)
);
CREATE INDEX IF NOT EXISTS attendance_proposals_date ON public.attendance_proposals (record_date);

ALTER TABLE public.attendance_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_proposals_read ON public.attendance_proposals FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id));
CREATE POLICY attendance_proposals_insert ON public.attendance_proposals FOR INSERT TO authenticated
  WITH CHECK (public.can_propose_attendance(worker_id));
CREATE POLICY attendance_proposals_update ON public.attendance_proposals FOR UPDATE TO authenticated
  USING (public.can_propose_attendance(worker_id)) WITH CHECK (public.can_propose_attendance(worker_id));
CREATE POLICY attendance_proposals_delete ON public.attendance_proposals FOR DELETE TO authenticated
  USING (public.can_propose_attendance(worker_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_proposals TO authenticated;

-- Quién la marcó (se guarda al crearla)
CREATE OR REPLACE FUNCTION public.attendance_proposal_author()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.proposed_by := auth.uid();
    NEW.proposed_by_email := COALESCE((SELECT email FROM public.user_roles WHERE user_id = auth.uid()), '');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS attendance_proposals_author ON public.attendance_proposals;
CREATE TRIGGER attendance_proposals_author
  BEFORE INSERT OR UPDATE ON public.attendance_proposals
  FOR EACH ROW EXECUTE FUNCTION public.attendance_proposal_author();

-- Un día bloqueado tampoco acepta propuestas
DROP TRIGGER IF EXISTS attendance_proposals_locked ON public.attendance_proposals;
CREATE TRIGGER attendance_proposals_locked
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_proposals
  FOR EACH ROW EXECUTE FUNCTION public.reject_locked_attendance_date();

-- Aprobar: pasa lo marcado de ese día a la asistencia oficial y bloquea el día en esas
-- sucursales. Solo lo que la administradora puede editar.
CREATE OR REPLACE FUNCTION public.approve_attendance_day(p_date TEXT)
RETURNS INT
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  n       INT;
  v_ids   TEXT[];
  v_sucs  TEXT[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo una administradora puede aprobar la asistencia.';
  END IF;

  SELECT COALESCE(array_agg(p.worker_id), '{}'), COALESCE(array_agg(DISTINCT w.sucursal), '{}')
  INTO v_ids, v_sucs
  FROM public.attendance_proposals p
  JOIN public.workers w ON w.id = p.worker_id
  WHERE p.record_date = p_date AND public.can_edit_worker(p.worker_id);

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

  INSERT INTO public.attendance_locked_dates (record_date, sucursal)
  SELECT DISTINCT p_date, s FROM unnest(v_sucs) s WHERE s <> ''
  ON CONFLICT (record_date, sucursal) DO NOTHING;

  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.approve_attendance_day(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_attendance_day(TEXT) TO authenticated;

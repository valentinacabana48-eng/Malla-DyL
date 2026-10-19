-- ─── Rol "asistencia" (jefas de caja) ────────────────────────────────────────
-- Ve lo mismo que "Solo lectura" en sus sucursales y además marca la asistencia
-- (quién vino, faltas, retiros). No anota horas extra, no bloquea días y no cambia
-- malla, personal, RRHH ni ajustes.

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('admin', 'lector', 'asistencia', 'pendiente'));

CREATE OR REPLACE FUNCTION public.can_read()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() IN ('admin', 'lector', 'asistencia'), false)
$$;

-- Puede marcar asistencia de este trabajador: admin de su sucursal o rol asistencia de su sucursal
CREATE OR REPLACE FUNCTION public.can_mark_attendance(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(public.app_role() IN ('admin', 'asistencia'), false) AND (
    public.in_my_sucursales(NULL)
    OR EXISTS (SELECT 1 FROM public.workers w WHERE w.id = p_worker_id AND public.in_my_sucursales(w.sucursal))
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_mark_attendance(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mark_attendance(TEXT) TO authenticated;

-- Asistencia: escritura con can_mark_attendance (las horas extra siguen solo para admin)
DROP POLICY IF EXISTS attendance_records_insert ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_update ON public.attendance_records;
DROP POLICY IF EXISTS attendance_records_delete ON public.attendance_records;
CREATE POLICY attendance_records_insert ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.can_mark_attendance(worker_id));
CREATE POLICY attendance_records_update ON public.attendance_records FOR UPDATE TO authenticated
  USING (public.can_mark_attendance(worker_id)) WITH CHECK (public.can_mark_attendance(worker_id));
CREATE POLICY attendance_records_delete ON public.attendance_records FOR DELETE TO authenticated
  USING (public.can_mark_attendance(worker_id));

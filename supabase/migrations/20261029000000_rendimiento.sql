-- ─── Rendimiento para más trabajadoras ───────────────────────────────────────
-- Índices para buscar por trabajadora en las tablas nuevas, reglas de user_roles que
-- leen auth.uid() una sola vez por consulta y se quita un índice repetido de asistencia
-- (attendance_records ya tiene el mismo índice por su restricción única).
-- Se puede volver a ejecutar sin error.

CREATE INDEX IF NOT EXISTS licencias_worker ON public.licencias (worker_id, desde);
CREATE INDEX IF NOT EXISTS publish_ocultos_worker ON public.publish_ocultos (worker_id);
CREATE INDEX IF NOT EXISTS published_schedule_days_worker ON public.published_schedule_days (worker_id);

ALTER POLICY user_roles_select ON public.user_roles
  USING ((user_id = (SELECT auth.uid())) OR public.is_global_admin());
ALTER POLICY user_roles_update ON public.user_roles
  USING (public.is_global_admin() AND user_id <> (SELECT auth.uid()))
  WITH CHECK (public.is_global_admin() AND user_id <> (SELECT auth.uid()));
ALTER POLICY user_roles_delete ON public.user_roles
  USING (public.is_global_admin() AND user_id <> (SELECT auth.uid()));

DROP INDEX IF EXISTS public.idx_attendance_records_worker_date;

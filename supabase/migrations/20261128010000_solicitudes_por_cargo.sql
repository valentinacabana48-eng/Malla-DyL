-- Solicitudes por cargo: en Ajustes → Usuarios se elige de qué cargos ve y responde
-- solicitudes cada persona (por ejemplo, una encargada ve las de cajeras y jefas de caja,
-- pero no las de tesoreras). Vacío = las de todos los cargos que ya ve.
-- La malla y el resto de la app siguen igual: solo cambia qué solicitudes ve.
-- Se puede volver a ejecutar sin error.

ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS solicitudes_cargos TEXT[];

-- El cargo del trabajador está entre los cargos de solicitudes de quien consulta
CREATE OR REPLACE FUNCTION public.in_my_solicitudes_cargos(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT r.solicitudes_cargos IS NULL OR cardinality(r.solicitudes_cargos) = 0
        OR EXISTS (
          SELECT 1 FROM public.workers w
          WHERE w.id = p_worker_id AND w.cargo = ANY(r.solicitudes_cargos)
        )
    FROM public.user_roles r WHERE r.user_id = auth.uid()
  ), false)
$$;

-- Responder (aprobar, rechazar, pre aprobar, publicar el día) también respeta esos cargos
CREATE OR REPLACE FUNCTION public.can_worker(p_worker_id TEXT, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_perm(p_perm) AND public.worker_in_scope(p_worker_id)
    AND (p_perm NOT IN ('solicitudes', 'solicitudes_responder')
         OR public.in_my_solicitudes_cargos(p_worker_id))
$$;

-- Ver las solicitudes
ALTER POLICY shift_requests_read ON public.shift_requests
  USING (
    (public.can_see_worker(worker_id) AND public.in_my_solicitudes_cargos(worker_id))
    OR (companera_id IS NOT NULL AND public.can_see_worker(companera_id)
        AND public.in_my_solicitudes_cargos(companera_id))
  );

-- ─── Permisos por sección ───────────────────────────────────────────────────
-- En Ajustes → Usuarios cada sección del menú tiene su casilla: Dashboard, Cumplimiento,
-- Solicitudes y Vista previa se suman a las que ya había. Antes se abrían con otros
-- permisos (Dashboard y Cumplimiento con "Personal ver", Vista previa con "Malla ver" y
-- Solicitudes con "Malla editar"), así que a las cuentas personalizadas se les marcan
-- las casillas nuevas según eso y nadie pierde acceso.
-- Se puede volver a ejecutar sin error.

CREATE OR REPLACE FUNCTION public.has_perm(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE r.role
      WHEN 'admin' THEN true
      WHEN 'lector' THEN p_perm IN ('dashboard', 'malla_ver', 'cumplimiento', 'personal_ver',
                                    'asistencia_ver', 'vista_previa')
      WHEN 'asistencia' THEN p_perm IN ('malla_ver', 'asistencia_ver', 'asistencia_marcar',
                                        'vista_previa')
      WHEN 'personalizado' THEN p_perm = ANY(COALESCE(r.permisos, '{}'))
      ELSE false
    END
    FROM public.user_roles r WHERE r.user_id = auth.uid()
  ), false)
$$;

-- Casillas nuevas para quienes ya entraban a esas secciones
UPDATE public.user_roles r
SET permisos = (
  SELECT array_agg(DISTINCT p ORDER BY p) FROM unnest(
    COALESCE(r.permisos, '{}')
    || CASE WHEN 'personal_ver' = ANY(r.permisos) THEN ARRAY['dashboard', 'cumplimiento'] ELSE '{}' END
    || CASE WHEN 'malla_ver' = ANY(r.permisos) THEN ARRAY['vista_previa'] ELSE '{}' END
    || CASE WHEN 'malla_editar' = ANY(r.permisos) THEN ARRAY['solicitudes'] ELSE '{}' END
  ) AS p
)
WHERE r.role = 'personalizado'
  AND r.permisos && ARRAY['personal_ver', 'malla_ver', 'malla_editar'];

-- Responder solicitudes pide la casilla de Solicitudes (antes, editar la malla)
CREATE OR REPLACE FUNCTION public.resolve_shift_request(
  p_id UUID, p_aprobar BOOLEAN, p_respuesta TEXT,
  p_turno TEXT DEFAULT NULL, p_turno_companera TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.shift_requests%ROWTYPE;
  v_turno TEXT;
  v_turno_comp TEXT;
BEGIN
  SELECT * INTO r FROM public.shift_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue respondida.';
  END IF;
  IF NOT public.can_worker(r.worker_id, 'solicitudes')
     OR (r.companera_id IS NOT NULL AND NOT public.can_worker(r.companera_id, 'solicitudes')) THEN
    RAISE EXCEPTION 'No tienes permiso para responder las solicitudes de estas trabajadoras.';
  END IF;

  IF p_aprobar THEN
    IF r.tipo = 'intercambio' AND r.companera_status <> 'aceptada' THEN
      RAISE EXCEPTION 'La compañera todavía no acepta el cambio.';
    END IF;
    v_turno := COALESCE(NULLIF(p_turno, ''),
                        CASE WHEN r.tipo = 'libre' THEN 'DESC' ELSE r.turno_pedido END);
    IF v_turno <> 'DESC' AND NOT EXISTS (SELECT 1 FROM public.shifts WHERE code = v_turno) THEN
      RAISE EXCEPTION 'Ese turno no existe.';
    END IF;
    PERFORM public.set_worker_shift_on(r.worker_id, r.fecha, v_turno);

    IF r.tipo = 'intercambio' THEN
      v_turno_comp := COALESCE(NULLIF(p_turno_companera, ''), NULLIF(r.turno_actual, ''), 'DESC');
      IF v_turno_comp <> 'DESC' AND NOT EXISTS (SELECT 1 FROM public.shifts WHERE code = v_turno_comp) THEN
        RAISE EXCEPTION 'Ese turno no existe.';
      END IF;
      PERFORM public.set_worker_shift_on(r.companera_id, r.fecha, v_turno_comp);
    END IF;
  END IF;

  UPDATE public.shift_requests SET
    status = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
    turno_pedido = CASE WHEN p_aprobar THEN v_turno ELSE turno_pedido END,
    turno_companera = CASE WHEN p_aprobar AND companera_id IS NOT NULL THEN v_turno_comp ELSE turno_companera END,
    respuesta = left(trim(COALESCE(p_respuesta, '')), 300),
    resolved_by_email = COALESCE((SELECT email FROM public.user_roles WHERE user_id = auth.uid()), ''),
    resolved_at = now()
  WHERE id = p_id;
END $$;

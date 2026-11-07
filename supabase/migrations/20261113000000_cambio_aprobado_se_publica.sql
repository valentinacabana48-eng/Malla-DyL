-- ─── Cambio de turno aprobado: se publica al tiro ─────────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--
-- Qué hace:
--   • Al aprobar una solicitud (día libre, cambio o intercambio con compañera), ese día se
--     publica de inmediato en Mis turnos para las trabajadoras involucradas. Solo ese día:
--     el resto de sus cambios sin publicar sigue esperando a que publiques.
--   • Si la malla del mes ya es definitiva, el día queda marcado como «Cambió» (punto
--     naranjo) y les llega el aviso al celular. Si es borrador, se reemplaza sin aviso de cambio.
--   • Si ese mes todavía no se le publicó a la trabajadora, no se publica nada.
-- Se puede volver a ejecutar sin error.

-- Publica un solo día de una trabajadora (lo que hay en la malla para esa fecha)
CREATE OR REPLACE FUNCTION public.publicar_dia_trabajadora(p_worker_id TEXT, p_fecha DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month TEXT := to_char(p_fecha, 'YYYY-MM');
  v_idx INT := EXTRACT(DAY FROM p_fecha)::INT - 1;
  v_row public.published_schedule_days%ROWTYPE;
  v_new JSONB;
  v_old_day JSONB;
  v_days JSONB;
  v_definitiva BOOLEAN;
  v_desde INT;
  v_hasta INT;
BEGIN
  SELECT * INTO v_row FROM public.published_schedule_days
  WHERE month_key = v_month AND worker_id = p_worker_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Día oculto al publicar: no se muestra
  SELECT o.desde_dia, o.hasta_dia INTO v_desde, v_hasta
  FROM public.publish_ocultos o WHERE o.month_key = v_month AND o.worker_id = p_worker_id;
  IF v_desde IS NOT NULL AND v_idx + 1 BETWEEN v_desde AND v_hasta THEN RETURN false; END IF;

  v_new := public.effective_month_days(v_month, p_worker_id) -> v_idx;
  v_old_day := v_row.days -> v_idx;
  -- Igual que publish_schedule: el nombre del turno no cuenta
  IF (CASE WHEN jsonb_typeof(v_new) = 'object' THEN v_new - 'l' ELSE v_new END)
     IS NOT DISTINCT FROM
     (CASE WHEN jsonb_typeof(v_old_day) = 'object' THEN v_old_day - 'l' ELSE v_old_day END) THEN
    RETURN false;
  END IF;

  v_days := v_row.days;
  WHILE jsonb_array_length(v_days) <= v_idx LOOP
    v_days := v_days || 'null'::jsonb;
  END LOOP;
  v_days := jsonb_set(v_days, ARRAY[v_idx::TEXT], COALESCE(v_new, 'null'::jsonb));

  SELECT COALESCE(p.definitiva, false) INTO v_definitiva
  FROM public.published_schedules p
  WHERE p.month_key = v_month AND p.sucursal = v_row.sucursal;

  IF COALESCE(v_definitiva, false) THEN
    UPDATE public.published_schedule_days
    SET days = v_days, prev_days = v_row.days, changed_days = ARRAY[v_idx],
        changed_at = now(), published_at = now()
    WHERE month_key = v_month AND worker_id = p_worker_id;
  ELSE
    UPDATE public.published_schedule_days
    SET days = v_days, prev_days = NULL, changed_days = '{}', changed_at = NULL,
        published_at = now()
    WHERE month_key = v_month AND worker_id = p_worker_id;
  END IF;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.publicar_dia_trabajadora(TEXT, DATE) FROM PUBLIC, anon, authenticated;

-- Igual que antes, y al aprobar se publica ese día
CREATE OR REPLACE FUNCTION public.resolve_shift_request(p_id uuid, p_aprobar boolean, p_respuesta text, p_turno text DEFAULT NULL::text, p_turno_companera text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.shift_requests%ROWTYPE;
  v_turno TEXT;
  v_turno_comp TEXT;
BEGIN
  SELECT * INTO r FROM public.shift_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue respondida.';
  END IF;
  IF NOT public.can_worker(r.worker_id, 'solicitudes_responder')
     OR (r.companera_id IS NOT NULL
         AND NOT public.can_worker(r.companera_id, 'solicitudes_responder')) THEN
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

    -- Se publica al tiro, solo ese día
    PERFORM public.publicar_dia_trabajadora(r.worker_id, r.fecha);
    IF r.tipo = 'intercambio' THEN
      PERFORM public.publicar_dia_trabajadora(r.companera_id, r.fecha);
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
END $function$;

-- Para cuando la app termina de ajustar el día después de aprobar (p. ej. un día libre
-- como permiso, que se marca después): vuelve a publicar el día de esa solicitud.
CREATE OR REPLACE FUNCTION public.publicar_dia_solicitud(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.shift_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.shift_requests WHERE id = p_id;
  IF NOT FOUND OR r.status <> 'aprobada' THEN RETURN; END IF;
  IF NOT public.can_worker(r.worker_id, 'solicitudes_responder') THEN
    RAISE EXCEPTION 'No tienes permiso para responder las solicitudes de esta trabajadora.';
  END IF;
  PERFORM public.publicar_dia_trabajadora(r.worker_id, r.fecha);
  IF r.companera_id IS NOT NULL AND public.can_worker(r.companera_id, 'solicitudes_responder') THEN
    PERFORM public.publicar_dia_trabajadora(r.companera_id, r.fecha);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.publicar_dia_solicitud(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publicar_dia_solicitud(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

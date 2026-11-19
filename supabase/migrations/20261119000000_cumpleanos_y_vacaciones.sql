-- ─── Día libre o permiso por cumpleaños o vacaciones ─────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   1. En el día libre (mes siguiente) y en el permiso (este mes) ella puede marcar el motivo
--      «Cumpleaños» o «Vacaciones» (queda en «turno pedido» como CUMPLEANOS / VACACIONES).
--      El cumpleaños se puede pedir una vez al año. Las vacaciones se piden desde/hasta
--      (hasta 30 días seguidos) en una sola solicitud.
--   2. Al aprobar como cumpleaños, ese día queda marcado así en la malla. Al aprobar
--      vacaciones, se marcan los días que aún no tienen nada en la malla; los días con turno
--      los marca la app como vacaciones (guardando el turno) y los días libres siguen libres.
-- No cambia ninguna solicitud que ya exista. Se puede volver a ejecutar sin error.

ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS hasta DATE;

-- Hacer una solicitud (ahora también «permiso»)
DROP FUNCTION IF EXISTS public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT[]);
CREATE OR REPLACE FUNCTION public.mis_turnos_request_create(
  p_token TEXT, p_tipo TEXT, p_fecha DATE, p_turno TEXT, p_motivo TEXT,
  p_companera TEXT DEFAULT NULL, p_turnos TEXT[] DEFAULT NULL, p_hasta DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_hoy DATE := (now() AT TIME ZONE 'America/Santiago')::date;
  v_mes_sig DATE := (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date) + INTERVAL '1 month')::date;
  v_turno TEXT := COALESCE(p_turno, '');
  v_hasta DATE := p_fecha;
  v_pedidos TEXT[];
  v_opciones TEXT[];
  v_meses TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                          'septiembre','octubre','noviembre','diciembre'];
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  IF p_tipo NOT IN ('libre', 'permiso', 'cambio', 'intercambio') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de solicitud no válido.');
  END IF;
  IF p_fecha IS NULL OR p_fecha < v_hoy OR p_fecha > v_hoy + 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Elige un día desde hoy y hasta 4 meses más.');
  END IF;
  -- Otro turno: solo días del mes siguiente (el mes en curso ya está armado)
  IF p_tipo = 'cambio'
     AND (p_fecha < v_mes_sig OR p_fecha >= (v_mes_sig + INTERVAL '1 month')::date) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Otro turno se pide solo para días de ' || v_meses[extract(month FROM v_mes_sig)::INT] || '.');
  END IF;
  -- Permiso: solo días del mes en curso (desde hoy). Con o sin goce, lo marca ella.
  IF p_tipo = 'permiso' AND p_fecha >= v_mes_sig THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'El permiso se pide solo para días de ' || v_meses[extract(month FROM v_hoy)::INT]
      || '. Para ' || v_meses[extract(month FROM v_mes_sig)::INT] || ' pide día libre.');
  END IF;
  IF p_tipo = 'permiso'
     AND v_turno NOT IN ('PERMISO_CG', 'PERMISO_SG', 'CUMPLEANOS', 'VACACIONES') THEN
    v_turno := 'PERMISO_CG';
  END IF;
  -- Día libre: descanso (vacío), cumpleaños o vacaciones
  IF p_tipo = 'libre' AND v_turno NOT IN ('CUMPLEANOS', 'VACACIONES') THEN
    v_turno := '';
  END IF;
  -- Cumpleaños: una vez al año
  IF p_tipo IN ('libre', 'permiso') AND v_turno = 'CUMPLEANOS' AND EXISTS (
       SELECT 1 FROM public.shift_requests r
       WHERE r.worker_id = v_wid AND r.tipo IN ('libre', 'permiso')
         AND r.turno_pedido = 'CUMPLEANOS' AND r.status IN ('pendiente', 'aprobada')
         AND extract(year FROM r.fecha) = extract(year FROM p_fecha)) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Ya pediste tu día de cumpleaños de ' || extract(year FROM p_fecha)::INT || '.');
  END IF;
  -- Vacaciones: desde/hasta, hasta 30 días seguidos
  IF p_tipo IN ('libre', 'permiso') AND v_turno = 'VACACIONES' AND p_hasta IS NOT NULL THEN
    IF p_hasta < p_fecha OR p_hasta > p_fecha + 29 THEN
      RETURN jsonb_build_object('ok', false, 'error',
        'Las vacaciones se piden de hasta 30 días seguidos.');
    END IF;
    v_hasta := p_hasta;
  END IF;
  IF p_tipo = 'cambio' AND NOT EXISTS (SELECT 1 FROM public.shifts s WHERE s.code = v_turno) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Elige el turno que quieres.');
  END IF;

  IF p_tipo = 'intercambio' THEN
    v_pedidos := CASE WHEN cardinality(p_turnos) > 0 THEN p_turnos ELSE ARRAY[v_turno] END;
    -- Solo los turnos que ese día tiene alguna compañera de su sucursal y cargo
    SELECT array_agg(t.code ORDER BY t.start_time, t.end_time) INTO v_opciones
    FROM (
      SELECT DISTINCT sh.code, sh.start_time, sh.end_time
      FROM public.workers me
      JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
        AND w.id <> me.id AND w.estado = 'Activo'
      JOIN public.shifts sh ON sh.code = public.worker_shift_on(w.id, p_fecha)
      WHERE me.id = v_wid AND sh.code = ANY (v_pedidos) AND sh.start_time <> ''
    ) t;
    IF v_opciones IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Ese día nadie tiene ese turno.');
    END IF;
    v_opciones := v_opciones[1:6];
  END IF;

  IF EXISTS (SELECT 1 FROM public.shift_requests r
             WHERE r.worker_id = v_wid AND r.status = 'pendiente'
               AND r.fecha <= v_hasta AND COALESCE(r.hasta, r.fecha) >= p_fecha) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes una solicitud pendiente para ese día.');
  END IF;
  IF (SELECT count(*) FROM public.shift_requests r
      WHERE r.worker_id = v_wid AND r.status = 'pendiente') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tienes muchas solicitudes pendientes.');
  END IF;

  INSERT INTO public.shift_requests
    (worker_id, tipo, fecha, hasta, turno_actual, turno_pedido, motivo, companera_status,
     turnos_opciones)
  VALUES (v_wid, p_tipo, p_fecha, CASE WHEN v_hasta > p_fecha THEN v_hasta END,
          public.worker_shift_on(v_wid, p_fecha),
          CASE p_tipo WHEN 'intercambio' THEN v_opciones[1] ELSE v_turno END,
          left(trim(COALESCE(p_motivo, '')), 300),
          CASE WHEN p_tipo = 'intercambio' THEN 'por_preaprobar' ELSE '' END,
          COALESCE(v_opciones, '{}'));
  RETURN jsonb_build_object('ok', true);
END $$;


-- Responder: también puede quedar como cumpleaños o vacaciones (día especial en la malla)
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
  v_dia DATE;
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
                        CASE WHEN r.tipo IN ('libre', 'permiso') THEN 'DESC' ELSE r.turno_pedido END);
    IF v_turno IN ('CUMPLEANOS', 'VACACIONES') AND r.tipo NOT IN ('libre', 'permiso') THEN
      RAISE EXCEPTION 'Ese turno no existe.';
    END IF;
    IF v_turno = 'CUMPLEANOS' THEN
      PERFORM public.set_special_day_cell(to_char(r.fecha, 'YYYY-MM'), r.worker_id,
                                          EXTRACT(DAY FROM r.fecha)::INT - 1, v_turno);
    ELSIF v_turno = 'VACACIONES' THEN
      -- Solo los días que aún no tienen nada (malla sin armar). Los días con turno los marca
      -- la app como vacaciones guardando el turno; los días libres siguen libres.
      FOR v_dia IN SELECT generate_series(r.fecha, COALESCE(r.hasta, r.fecha), INTERVAL '1 day')::date
      LOOP
        IF public.worker_shift_on(r.worker_id, v_dia) = '' THEN
          PERFORM public.set_special_day_cell(to_char(v_dia, 'YYYY-MM'), r.worker_id,
                                              EXTRACT(DAY FROM v_dia)::INT - 1, 'VACACIONES');
        END IF;
        IF v_dia > r.fecha THEN
          PERFORM public.publicar_dia_trabajadora(r.worker_id, v_dia);
        END IF;
      END LOOP;
    ELSE
      IF v_turno <> 'DESC' AND NOT EXISTS (SELECT 1 FROM public.shifts WHERE code = v_turno) THEN
        RAISE EXCEPTION 'Ese turno no existe.';
      END IF;
      PERFORM public.set_worker_shift_on(r.worker_id, r.fecha, v_turno);
    END IF;

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


-- Publicar de nuevo los días (después de marcar las vacaciones con turno): todo el rango
CREATE OR REPLACE FUNCTION public.publicar_dia_solicitud(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.shift_requests%ROWTYPE;
  v_dia DATE;
BEGIN
  SELECT * INTO r FROM public.shift_requests WHERE id = p_id;
  IF NOT FOUND OR r.status <> 'aprobada' THEN RETURN; END IF;
  IF NOT public.can_worker(r.worker_id, 'solicitudes_responder') THEN
    RAISE EXCEPTION 'No tienes permiso para responder las solicitudes de esta trabajadora.';
  END IF;
  FOR v_dia IN SELECT generate_series(r.fecha, COALESCE(r.hasta, r.fecha), INTERVAL '1 day')::date
  LOOP
    PERFORM public.publicar_dia_trabajadora(r.worker_id, v_dia);
  END LOOP;
  IF r.companera_id IS NOT NULL AND public.can_worker(r.companera_id, 'solicitudes_responder') THEN
    PERFORM public.publicar_dia_trabajadora(r.companera_id, r.fecha);
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.publicar_dia_solicitud(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publicar_dia_solicitud(UUID) TO authenticated;

-- Sus solicitudes (ahora con «hasta» en las vacaciones)
CREATE OR REPLACE FUNCTION public.mis_turnos_requests(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  RETURN jsonb_build_object('ok', true, 'requests', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id, 'tipo', r.tipo, 'fecha', r.fecha, 'hasta', r.hasta,
             'turno_actual', r.turno_actual, 'turno_pedido', r.turno_pedido,
             'turnos_opciones', CASE WHEN r.worker_id = v_wid THEN to_jsonb(r.turnos_opciones) ELSE '[]'::jsonb END,
             'motivo', r.motivo, 'status', r.status, 'respuesta', r.respuesta,
             'companera_status', r.companera_status,
             'turno_companera', CASE WHEN r.worker_id = v_wid THEN '' ELSE r.turno_companera END,
             'mia', r.worker_id = v_wid,
             'otra', (SELECT o.name FROM public.workers o
                      WHERE o.id = CASE WHEN r.worker_id = v_wid THEN r.companera_id ELSE r.worker_id END),
             'created_at', r.created_at) ORDER BY r.fecha DESC, r.created_at DESC)
    FROM public.shift_requests r
    WHERE (r.worker_id = v_wid OR r.companera_id = v_wid)
      AND COALESCE(r.hasta, r.fecha) >= (now() AT TIME ZONE 'America/Santiago')::date - 60
  ), '[]'::jsonb));
END $$;

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT[], DATE),
  public.mis_turnos_requests(TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT[], DATE),
  public.mis_turnos_requests(TEXT)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

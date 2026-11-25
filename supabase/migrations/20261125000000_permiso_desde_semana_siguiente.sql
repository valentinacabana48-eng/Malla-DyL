-- ─── Día libre y permiso: desde la semana siguiente ──────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   El día libre y el permiso se piden desde el lunes de la semana siguiente: para esta
--   semana ya no se pueden pedir. El cambio de turno y el cambio con compañera siguen igual.
-- No cambia ninguna solicitud que ya exista. Se puede volver a ejecutar sin error.

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
  -- Día libre o permiso: desde el lunes de la semana siguiente
  IF p_tipo IN ('libre', 'permiso')
     AND p_fecha < v_hoy + (8 - extract(isodow FROM v_hoy)::INT) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'El permiso se pide desde la semana siguiente: desde el lunes '
      || extract(day FROM v_hoy + (8 - extract(isodow FROM v_hoy)::INT))::INT || '.');
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

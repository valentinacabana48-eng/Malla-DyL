-- ─── Cambio con compañera en dos pasos, sin ver el horario de las demás ───────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   1. La trabajadora elige el día y ve solo los turnos que hay ese día (sin nombres).
--      Elige uno y la solicitud le llega a la jefatura.
--   2. La jefatura la pre aprueba (o la rechaza).
--   3. Recién ahí ella ve quiénes tienen ese turno ese día (solo nombres) y elige a una.
--   4. La compañera acepta o no, y la jefatura aprueba el cambio definitivo.
--   • A quien pidió el cambio ya no le llega el turno final de la compañera.
--   • Las solicitudes que ya estaban esperando a una compañera siguen igual.
-- Se puede volver a ejecutar sin error.

-- Etapas del cambio con compañera:
--   por_preaprobar → elegir → pendiente (la compañera responde) → aceptada / rechazada
ALTER TABLE public.shift_requests DROP CONSTRAINT IF EXISTS shift_requests_companera_status_check;
ALTER TABLE public.shift_requests ADD CONSTRAINT shift_requests_companera_status_check
  CHECK (companera_status IN ('', 'por_preaprobar', 'elegir', 'pendiente', 'aceptada', 'rechazada'));

-- Turnos que tienen ese día sus compañeras de sucursal y cargo, distintos al suyo (sin nombres)
CREATE OR REPLACE FUNCTION public.mis_turnos_day_shifts(p_token TEXT, p_fecha DATE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_mine TEXT;
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  v_mine := public.worker_shift_on(v_wid, p_fecha);
  RETURN jsonb_build_object('ok', true, 'mine', v_mine, 'shifts', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('code', t.code, 'start', t.start_time, 'end', t.end_time)
                     ORDER BY t.start_time, t.end_time)
    FROM (
      SELECT DISTINCT sh.code, sh.start_time, sh.end_time
      FROM public.workers me
      JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
        AND w.id <> me.id AND w.estado = 'Activo'
      JOIN public.shifts sh ON sh.code = public.worker_shift_on(w.id, p_fecha)
      WHERE me.id = v_wid AND sh.start_time <> '' AND sh.code IS DISTINCT FROM v_mine
    ) t
  ), '[]'::jsonb));
END $$;

-- Compañeras que tienen el turno pedido ese día (solo el nombre). Solo después de la pre aprobación.
DROP FUNCTION IF EXISTS public.mis_turnos_coworkers(TEXT, DATE);
CREATE OR REPLACE FUNCTION public.mis_turnos_coworkers(p_token TEXT, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  r public.shift_requests%ROWTYPE;
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  SELECT * INTO r FROM public.shift_requests
  WHERE id = p_id AND worker_id = v_wid AND status = 'pendiente' AND companera_status = 'elegir';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta solicitud ya no está para elegir compañera.');
  END IF;
  RETURN jsonb_build_object('ok', true, 'coworkers', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) ORDER BY w.name)
    FROM public.workers me
    JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
      AND w.id <> me.id AND w.estado = 'Activo'
    WHERE me.id = v_wid AND public.worker_shift_on(w.id, r.fecha) = r.turno_pedido
  ), '[]'::jsonb));
END $$;

-- Sus solicitudes y las que le hicieron sus compañeras (de los últimos 60 días y las que vienen).
-- A quien pidió el cambio no le llega el turno final de la compañera.
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
             'id', r.id, 'tipo', r.tipo, 'fecha', r.fecha,
             'turno_actual', r.turno_actual, 'turno_pedido', r.turno_pedido,
             'motivo', r.motivo, 'status', r.status, 'respuesta', r.respuesta,
             'companera_status', r.companera_status,
             'turno_companera', CASE WHEN r.worker_id = v_wid THEN '' ELSE r.turno_companera END,
             'mia', r.worker_id = v_wid,
             'otra', (SELECT o.name FROM public.workers o
                      WHERE o.id = CASE WHEN r.worker_id = v_wid THEN r.companera_id ELSE r.worker_id END),
             'created_at', r.created_at) ORDER BY r.fecha DESC, r.created_at DESC)
    FROM public.shift_requests r
    WHERE (r.worker_id = v_wid OR r.companera_id = v_wid)
      AND r.fecha >= (now() AT TIME ZONE 'America/Santiago')::date - 60
  ), '[]'::jsonb));
END $$;

-- Hacer una solicitud. En un cambio con compañera se pide un turno (p_turno), no a una persona.
CREATE OR REPLACE FUNCTION public.mis_turnos_request_create(
  p_token TEXT, p_tipo TEXT, p_fecha DATE, p_turno TEXT, p_motivo TEXT, p_companera TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_hoy DATE := (now() AT TIME ZONE 'America/Santiago')::date;
  v_turno TEXT := COALESCE(p_turno, '');
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  IF p_tipo NOT IN ('libre', 'cambio', 'intercambio') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de solicitud no válido.');
  END IF;
  IF p_fecha IS NULL OR p_fecha < v_hoy OR p_fecha > v_hoy + 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Elige un día desde hoy y hasta 4 meses más.');
  END IF;
  IF p_tipo = 'cambio' AND NOT EXISTS (SELECT 1 FROM public.shifts s WHERE s.code = v_turno) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Elige el turno que quieres.');
  END IF;
  -- El turno tiene que tenerlo ese día alguna compañera de su sucursal y cargo
  IF p_tipo = 'intercambio' AND NOT EXISTS (
       SELECT 1 FROM public.workers me
       JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
         AND w.id <> me.id AND w.estado = 'Activo'
       JOIN public.shifts sh ON sh.code = public.worker_shift_on(w.id, p_fecha)
       WHERE me.id = v_wid AND sh.code = v_turno AND sh.start_time <> '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ese día nadie tiene ese turno.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.shift_requests r
             WHERE r.worker_id = v_wid AND r.fecha = p_fecha AND r.status = 'pendiente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes una solicitud pendiente para ese día.');
  END IF;
  IF (SELECT count(*) FROM public.shift_requests r
      WHERE r.worker_id = v_wid AND r.status = 'pendiente') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tienes muchas solicitudes pendientes.');
  END IF;

  INSERT INTO public.shift_requests
    (worker_id, tipo, fecha, turno_actual, turno_pedido, motivo, companera_status)
  VALUES (v_wid, p_tipo, p_fecha, public.worker_shift_on(v_wid, p_fecha),
          CASE WHEN p_tipo IN ('cambio', 'intercambio') THEN v_turno ELSE '' END,
          left(trim(COALESCE(p_motivo, '')), 300),
          CASE WHEN p_tipo = 'intercambio' THEN 'por_preaprobar' ELSE '' END);
  RETURN jsonb_build_object('ok', true);
END $$;

-- Después de la pre aprobación, elige a la compañera y a ella le llega para aceptar
CREATE OR REPLACE FUNCTION public.mis_turnos_request_pick(p_token TEXT, p_id UUID, p_companera TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  r public.shift_requests%ROWTYPE;
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  SELECT * INTO r FROM public.shift_requests
  WHERE id = p_id AND worker_id = v_wid AND status = 'pendiente' AND companera_status = 'elegir'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta solicitud ya no está para elegir compañera.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workers me JOIN public.workers w
                   ON w.sucursal = me.sucursal AND w.cargo = me.cargo AND w.estado = 'Activo'
                 WHERE me.id = v_wid AND w.id = p_companera AND w.id <> me.id
                   AND public.worker_shift_on(w.id, r.fecha) = r.turno_pedido) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa compañera ya no tiene ese turno ese día.');
  END IF;
  UPDATE public.shift_requests SET
    companera_id = p_companera,
    companera_status = 'pendiente',
    turno_companera_antes = r.turno_pedido,
    turno_actual = public.worker_shift_on(v_wid, r.fecha)
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- La jefatura pre aprueba: desde ahí ella puede elegir con quién cambiar
CREATE OR REPLACE FUNCTION public.preapprove_shift_request(p_id UUID, p_respuesta TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.shift_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.shift_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pendiente' OR r.companera_status <> 'por_preaprobar' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue respondida.';
  END IF;
  IF NOT public.can_worker(r.worker_id, 'solicitudes_responder') THEN
    RAISE EXCEPTION 'No tienes permiso para responder las solicitudes de esta trabajadora.';
  END IF;
  UPDATE public.shift_requests SET
    companera_status = 'elegir',
    respuesta = COALESCE(NULLIF(left(trim(COALESCE(p_respuesta, '')), 300), ''), respuesta)
  WHERE id = p_id;
END $$;

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.preapprove_shift_request(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preapprove_shift_request(UUID, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.mis_turnos_day_shifts(TEXT, DATE),
  public.mis_turnos_coworkers(TEXT, UUID),
  public.mis_turnos_requests(TEXT),
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT),
  public.mis_turnos_request_pick(TEXT, UUID, TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.mis_turnos_day_shifts(TEXT, DATE),
  public.mis_turnos_coworkers(TEXT, UUID),
  public.mis_turnos_requests(TEXT),
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT),
  public.mis_turnos_request_pick(TEXT, UUID, TEXT)
TO anon, authenticated;

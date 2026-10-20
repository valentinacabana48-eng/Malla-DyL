-- ─── Solicitudes de día libre y de cambio de turno ──────────────────────────
-- La trabajadora las hace desde Mis turnos (con su RUT y clave). Las responde quien
-- puede editar su malla (en un cambio con compañera, ella acepta primero). Al aprobar, la malla
-- se cambia sola (queda sin publicar).
-- Se puede volver a ejecutar sin error.

CREATE TABLE IF NOT EXISTS public.shift_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  fecha DATE NOT NULL,
  turno_actual TEXT NOT NULL DEFAULT '',
  turno_pedido TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobada', 'rechazada', 'cancelada')),
  respuesta TEXT NOT NULL DEFAULT '',
  resolved_by_email TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Cambio con una compañera: ella acepta primero y después aprueba la administración
ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS companera_id TEXT
  REFERENCES public.workers(id) ON DELETE CASCADE;
ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS companera_status TEXT NOT NULL DEFAULT '';
-- Turno con que quedó la compañera al aprobar (puede ser ajustado)
ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS turno_companera TEXT NOT NULL DEFAULT '';
ALTER TABLE public.shift_requests DROP CONSTRAINT IF EXISTS shift_requests_tipo_check;
ALTER TABLE public.shift_requests ADD CONSTRAINT shift_requests_tipo_check
  CHECK (tipo IN ('libre', 'cambio', 'intercambio'));
ALTER TABLE public.shift_requests DROP CONSTRAINT IF EXISTS shift_requests_companera_status_check;
ALTER TABLE public.shift_requests ADD CONSTRAINT shift_requests_companera_status_check
  CHECK (companera_status IN ('', 'pendiente', 'aceptada', 'rechazada'));
CREATE INDEX IF NOT EXISTS shift_requests_companera ON public.shift_requests (companera_id);
CREATE INDEX IF NOT EXISTS shift_requests_worker ON public.shift_requests (worker_id, fecha);
CREATE INDEX IF NOT EXISTS shift_requests_status ON public.shift_requests (status);
ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

-- La administración ve las de sus trabajadoras; los cambios van por las funciones de abajo
DROP POLICY IF EXISTS shift_requests_read ON public.shift_requests;
CREATE POLICY shift_requests_read ON public.shift_requests FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id)
         OR (companera_id IS NOT NULL AND public.can_see_worker(companera_id)));

-- Turno de la malla (sin publicar) de una trabajadora en una fecha
CREATE OR REPLACE FUNCTION public.worker_shift_on(p_worker_id TEXT, p_fecha DATE)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT sp.days ->> (EXTRACT(DAY FROM p_fecha)::INT - 1)::TEXT
       FROM public.special_days_v2 sp
      WHERE sp.worker_id = p_worker_id AND sp.month_key = to_char(p_fecha, 'YYYY-MM')),
    (SELECT s.days ->> (EXTRACT(DAY FROM p_fecha)::INT - 1)
       FROM public.schedule_data s
      WHERE s.worker_id = p_worker_id AND s.month_key = to_char(p_fecha, 'YYYY-MM')),
    '')
$$;

-- Pone un turno en la malla (sin publicar) y quita lo especial de ese día
CREATE OR REPLACE FUNCTION public.set_worker_shift_on(p_worker_id TEXT, p_fecha DATE, p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month TEXT := to_char(p_fecha, 'YYYY-MM');
  v_idx INT := EXTRACT(DAY FROM p_fecha)::INT - 1;
  v_len INT := EXTRACT(DAY FROM (date_trunc('month', p_fecha) + INTERVAL '1 month - 1 day'))::INT;
  v_days JSONB;
BEGIN
  SELECT days INTO v_days FROM public.schedule_data
  WHERE worker_id = p_worker_id AND month_key = v_month;
  v_days := COALESCE(v_days, '[]'::jsonb);
  WHILE jsonb_array_length(v_days) < v_len LOOP
    v_days := v_days || 'null'::jsonb;
  END LOOP;
  v_days := jsonb_set(v_days, ARRAY[v_idx::TEXT], to_jsonb(p_code));

  INSERT INTO public.schedule_data (month_key, worker_id, days, updated_at)
  VALUES (v_month, p_worker_id, v_days, now())
  ON CONFLICT (month_key, worker_id) DO UPDATE SET days = EXCLUDED.days, updated_at = now();

  UPDATE public.special_days_v2 SET days = days - v_idx::TEXT, updated_at = now()
  WHERE worker_id = p_worker_id AND month_key = v_month AND days ? v_idx::TEXT;
END $$;

-- ─── Mis turnos (sin cuenta, con el token de la sesión) ─────────────────────
-- Turnos que puede pedir: los compartidos y los de su sucursal
CREATE OR REPLACE FUNCTION public.mis_turnos_shifts(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  RETURN jsonb_build_object('ok', true, 'shifts', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('code', s.code, 'start', s.start_time, 'end', s.end_time)
                     ORDER BY s.start_time, s.end_time)
    FROM public.shifts s
    WHERE s.start_time <> '' AND s.end_time <> ''
      AND (s.sucursal IS NULL OR s.sucursal = '' OR
           s.sucursal = (SELECT w.sucursal FROM public.workers w WHERE w.id = v_wid))
  ), '[]'::jsonb));
END $$;

-- Compañeras de su sucursal y cargo que trabajan ese día con otro horario (solo nombre y horario)
CREATE OR REPLACE FUNCTION public.mis_turnos_coworkers(p_token TEXT, p_fecha DATE)
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
  RETURN jsonb_build_object('ok', true, 'mine', v_mine, 'coworkers', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code,
                                        'start', c.start_time, 'end', c.end_time)
                     ORDER BY c.start_time, c.name)
    FROM (
      SELECT w.id, w.name, sh.code, sh.start_time, sh.end_time
      FROM public.workers me
      JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
        AND w.id <> me.id AND w.estado = 'Activo'
      JOIN public.shifts sh ON sh.code = public.worker_shift_on(w.id, p_fecha)
      WHERE me.id = v_wid AND sh.start_time <> '' AND sh.code IS DISTINCT FROM v_mine
    ) c
  ), '[]'::jsonb));
END $$;

-- Sus solicitudes y las que le hicieron sus compañeras (de los últimos 60 días y las que vienen)
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
             'turno_companera', r.turno_companera,
             'mia', r.worker_id = v_wid,
             'otra', (SELECT o.name FROM public.workers o
                      WHERE o.id = CASE WHEN r.worker_id = v_wid THEN r.companera_id ELSE r.worker_id END),
             'created_at', r.created_at) ORDER BY r.fecha DESC, r.created_at DESC)
    FROM public.shift_requests r
    WHERE (r.worker_id = v_wid OR r.companera_id = v_wid)
      AND r.fecha >= (now() AT TIME ZONE 'America/Santiago')::date - 60
  ), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.mis_turnos_request_create(
  p_token TEXT, p_tipo TEXT, p_fecha DATE, p_turno TEXT, p_motivo TEXT, p_companera TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_hoy DATE := (now() AT TIME ZONE 'America/Santiago')::date;
  v_turno TEXT := COALESCE(p_turno, '');
  v_suya TEXT;
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
  IF p_tipo = 'intercambio' THEN
    -- La compañera tiene que ser de su sucursal y cargo, y trabajar ese día
    IF NOT EXISTS (SELECT 1 FROM public.workers me JOIN public.workers w
                     ON w.sucursal = me.sucursal AND w.cargo = me.cargo AND w.estado = 'Activo'
                   WHERE me.id = v_wid AND w.id = p_companera AND w.id <> me.id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Elige a la compañera.');
    END IF;
    v_suya := public.worker_shift_on(p_companera, p_fecha);
    IF NOT EXISTS (SELECT 1 FROM public.shifts s WHERE s.code = v_suya AND s.start_time <> '') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Esa compañera no tiene turno ese día.');
    END IF;
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
    (worker_id, tipo, fecha, turno_actual, turno_pedido, motivo, companera_id, companera_status)
  VALUES (v_wid, p_tipo, p_fecha, public.worker_shift_on(v_wid, p_fecha),
          CASE p_tipo WHEN 'cambio' THEN v_turno WHEN 'intercambio' THEN v_suya ELSE '' END,
          left(trim(COALESCE(p_motivo, '')), 300),
          CASE WHEN p_tipo = 'intercambio' THEN p_companera END,
          CASE WHEN p_tipo = 'intercambio' THEN 'pendiente' ELSE '' END);
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.mis_turnos_request_cancel(p_token TEXT, p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  UPDATE public.shift_requests SET status = 'cancelada', resolved_at = now()
  WHERE id = p_id AND worker_id = v_wid AND status = 'pendiente';
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- La compañera acepta o rechaza el cambio
CREATE OR REPLACE FUNCTION public.mis_turnos_request_answer(p_token TEXT, p_id UUID, p_acepta BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  UPDATE public.shift_requests SET
    companera_status = CASE WHEN p_acepta THEN 'aceptada' ELSE 'rechazada' END,
    status = CASE WHEN p_acepta THEN status ELSE 'rechazada' END,
    respuesta = CASE WHEN p_acepta THEN respuesta ELSE 'La compañera no aceptó el cambio.' END,
    resolved_at = CASE WHEN p_acepta THEN resolved_at ELSE now() END
  WHERE id = p_id AND companera_id = v_wid AND status = 'pendiente' AND companera_status = 'pendiente';
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- ─── Administración: aprobar o rechazar ─────────────────────────────────────
-- Al aprobar se puede ajustar el turno que queda a cada una (p_turno y p_turno_companera);
-- si no se indica, queda lo que se pidió.
DROP FUNCTION IF EXISTS public.resolve_shift_request(UUID, BOOLEAN, TEXT);
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
  IF NOT public.can_edit_worker(r.worker_id)
     OR (r.companera_id IS NOT NULL AND NOT public.can_edit_worker(r.companera_id)) THEN
    RAISE EXCEPTION 'No tienes permiso para editar la malla de estas trabajadoras.';
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

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.worker_shift_on(TEXT, DATE),
  public.set_worker_shift_on(TEXT, DATE, TEXT)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT, TEXT, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT);
REVOKE EXECUTE ON FUNCTION
  public.mis_turnos_shifts(TEXT),
  public.mis_turnos_coworkers(TEXT, DATE),
  public.mis_turnos_requests(TEXT),
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT),
  public.mis_turnos_request_cancel(TEXT, UUID),
  public.mis_turnos_request_answer(TEXT, UUID, BOOLEAN)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.mis_turnos_shifts(TEXT),
  public.mis_turnos_coworkers(TEXT, DATE),
  public.mis_turnos_requests(TEXT),
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT),
  public.mis_turnos_request_cancel(TEXT, UUID),
  public.mis_turnos_request_answer(TEXT, UUID, BOOLEAN)
TO anon, authenticated;

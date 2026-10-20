-- ─── Solicitudes de día libre y de cambio de turno ──────────────────────────
-- La trabajadora las hace desde Mis turnos (con su RUT y clave). Las responde quien
-- puede editar su malla; al aprobar, la malla se cambia sola (queda sin publicar).
-- Se puede volver a ejecutar sin error.

CREATE TABLE IF NOT EXISTS public.shift_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('libre', 'cambio')),
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
CREATE INDEX IF NOT EXISTS shift_requests_worker ON public.shift_requests (worker_id, fecha);
CREATE INDEX IF NOT EXISTS shift_requests_status ON public.shift_requests (status);
ALTER TABLE public.shift_requests ENABLE ROW LEVEL SECURITY;

-- La administración ve las de sus trabajadoras; los cambios van por las funciones de abajo
DROP POLICY IF EXISTS shift_requests_read ON public.shift_requests;
CREATE POLICY shift_requests_read ON public.shift_requests FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id));

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

-- Sus solicitudes (las de los últimos 60 días y las que vienen)
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
             'id', r.id, 'tipo', r.tipo, 'fecha', r.fecha, 'turno_pedido', r.turno_pedido,
             'motivo', r.motivo, 'status', r.status, 'respuesta', r.respuesta,
             'created_at', r.created_at) ORDER BY r.fecha DESC, r.created_at DESC)
    FROM public.shift_requests r
    WHERE r.worker_id = v_wid
      AND r.fecha >= (now() AT TIME ZONE 'America/Santiago')::date - 60
  ), '[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.mis_turnos_request_create(
  p_token TEXT, p_tipo TEXT, p_fecha DATE, p_turno TEXT, p_motivo TEXT)
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
  IF p_tipo NOT IN ('libre', 'cambio') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de solicitud no válido.');
  END IF;
  IF p_fecha IS NULL OR p_fecha < v_hoy OR p_fecha > v_hoy + 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Elige un día desde hoy y hasta 4 meses más.');
  END IF;
  IF p_tipo = 'cambio' AND NOT EXISTS (SELECT 1 FROM public.shifts s WHERE s.code = v_turno) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Elige el turno que quieres.');
  END IF;
  IF EXISTS (SELECT 1 FROM public.shift_requests r
             WHERE r.worker_id = v_wid AND r.fecha = p_fecha AND r.status = 'pendiente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes una solicitud pendiente para ese día.');
  END IF;
  IF (SELECT count(*) FROM public.shift_requests r
      WHERE r.worker_id = v_wid AND r.status = 'pendiente') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tienes muchas solicitudes pendientes.');
  END IF;

  INSERT INTO public.shift_requests (worker_id, tipo, fecha, turno_actual, turno_pedido, motivo)
  VALUES (v_wid, p_tipo, p_fecha, public.worker_shift_on(v_wid, p_fecha),
          CASE WHEN p_tipo = 'cambio' THEN v_turno ELSE '' END,
          left(trim(COALESCE(p_motivo, '')), 300));
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

-- ─── Administración: aprobar o rechazar ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_shift_request(p_id UUID, p_aprobar BOOLEAN, p_respuesta TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.shift_requests%ROWTYPE;
  v_month TEXT;
  v_idx INT;
  v_len INT;
  v_code TEXT;
  v_days JSONB;
BEGIN
  SELECT * INTO r FROM public.shift_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pendiente' THEN
    RAISE EXCEPTION 'Esta solicitud ya fue respondida.';
  END IF;
  IF NOT public.can_edit_worker(r.worker_id) THEN
    RAISE EXCEPTION 'No tienes permiso para editar la malla de esta trabajadora.';
  END IF;

  IF p_aprobar THEN
    v_month := to_char(r.fecha, 'YYYY-MM');
    v_idx := EXTRACT(DAY FROM r.fecha)::INT - 1;
    v_len := EXTRACT(DAY FROM (date_trunc('month', r.fecha) + INTERVAL '1 month - 1 day'))::INT;
    v_code := CASE WHEN r.tipo = 'libre' THEN 'DESC' ELSE r.turno_pedido END;

    SELECT days INTO v_days FROM public.schedule_data
    WHERE worker_id = r.worker_id AND month_key = v_month;
    v_days := COALESCE(v_days, '[]'::jsonb);
    WHILE jsonb_array_length(v_days) < v_len LOOP
      v_days := v_days || 'null'::jsonb;
    END LOOP;
    v_days := jsonb_set(v_days, ARRAY[v_idx::TEXT], to_jsonb(v_code));

    INSERT INTO public.schedule_data (month_key, worker_id, days, updated_at)
    VALUES (v_month, r.worker_id, v_days, now())
    ON CONFLICT (month_key, worker_id) DO UPDATE SET days = EXCLUDED.days, updated_at = now();

    -- Si ese día tenía vacaciones, permiso u otro, se quita para que quede el turno aprobado
    UPDATE public.special_days_v2 SET days = days - v_idx::TEXT, updated_at = now()
    WHERE worker_id = r.worker_id AND month_key = v_month AND days ? v_idx::TEXT;
  END IF;

  UPDATE public.shift_requests SET
    status = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
    respuesta = left(trim(COALESCE(p_respuesta, '')), 300),
    resolved_by_email = COALESCE((SELECT email FROM public.user_roles WHERE user_id = auth.uid()), ''),
    resolved_at = now()
  WHERE id = p_id;
END $$;

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.worker_shift_on(TEXT, DATE) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_shift_request(UUID, BOOLEAN, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.mis_turnos_shifts(TEXT),
  public.mis_turnos_requests(TEXT),
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT),
  public.mis_turnos_request_cancel(TEXT, UUID)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.mis_turnos_shifts(TEXT),
  public.mis_turnos_requests(TEXT),
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT),
  public.mis_turnos_request_cancel(TEXT, UUID)
TO anon, authenticated;

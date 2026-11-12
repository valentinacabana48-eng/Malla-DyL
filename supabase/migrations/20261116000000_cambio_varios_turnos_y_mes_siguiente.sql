-- ─── Cambio de turno: solo el mes siguiente, varios turnos y elegir otra compañera ──
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   1. «Otro turno» se puede pedir solo para días del mes siguiente (no del mes en curso).
--   2. En «Con compañera» se pueden marcar varios turnos que le sirven ese día. Al elegir
--      compañera ve a todas las que tienen alguno de esos turnos.
--   3. Si la compañera no acepta, la solicitud NO se cae: vuelve a «elige compañera» y
--      puede pedírselo a otra (la que dijo que no ya no aparece).
--   4. Mientras espera a la compañera, puede retirarle la solicitud y elegir a otra.
-- No cambia ninguna solicitud que ya exista. Se puede volver a ejecutar sin error.

-- Turnos que le sirven (cambio con compañera) y compañeras que ya dijeron que no
ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS turnos_opciones TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.shift_requests ADD COLUMN IF NOT EXISTS companeras_no TEXT[] NOT NULL DEFAULT '{}';

-- Turnos que le sirven: los que marcó o, en solicitudes antiguas, el turno pedido
CREATE OR REPLACE FUNCTION public.shift_request_opciones(r public.shift_requests)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT CASE WHEN cardinality(r.turnos_opciones) > 0 THEN r.turnos_opciones
              ELSE ARRAY[r.turno_pedido] END
$$;
REVOKE EXECUTE ON FUNCTION public.shift_request_opciones(public.shift_requests) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shift_request_opciones(public.shift_requests) TO authenticated;

-- Hacer una solicitud. En un cambio con compañera se marcan uno o más turnos (p_turnos).
DROP FUNCTION IF EXISTS public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.mis_turnos_request_create(
  p_token TEXT, p_tipo TEXT, p_fecha DATE, p_turno TEXT, p_motivo TEXT,
  p_companera TEXT DEFAULT NULL, p_turnos TEXT[] DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_hoy DATE := (now() AT TIME ZONE 'America/Santiago')::date;
  v_mes_sig DATE := (date_trunc('month', (now() AT TIME ZONE 'America/Santiago')::date) + INTERVAL '1 month')::date;
  v_turno TEXT := COALESCE(p_turno, '');
  v_pedidos TEXT[];
  v_opciones TEXT[];
  v_meses TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                          'septiembre','octubre','noviembre','diciembre'];
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
  -- Otro turno: solo días del mes siguiente (el mes en curso ya está armado)
  IF p_tipo = 'cambio'
     AND (p_fecha < v_mes_sig OR p_fecha >= (v_mes_sig + INTERVAL '1 month')::date) THEN
    RETURN jsonb_build_object('ok', false, 'error',
      'Otro turno se pide solo para días de ' || v_meses[extract(month FROM v_mes_sig)::INT] || '.');
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
             WHERE r.worker_id = v_wid AND r.fecha = p_fecha AND r.status = 'pendiente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes una solicitud pendiente para ese día.');
  END IF;
  IF (SELECT count(*) FROM public.shift_requests r
      WHERE r.worker_id = v_wid AND r.status = 'pendiente') >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tienes muchas solicitudes pendientes.');
  END IF;

  INSERT INTO public.shift_requests
    (worker_id, tipo, fecha, turno_actual, turno_pedido, motivo, companera_status, turnos_opciones)
  VALUES (v_wid, p_tipo, p_fecha, public.worker_shift_on(v_wid, p_fecha),
          CASE p_tipo WHEN 'cambio' THEN v_turno WHEN 'intercambio' THEN v_opciones[1] ELSE '' END,
          left(trim(COALESCE(p_motivo, '')), 300),
          CASE WHEN p_tipo = 'intercambio' THEN 'por_preaprobar' ELSE '' END,
          COALESCE(v_opciones, '{}'));
  RETURN jsonb_build_object('ok', true);
END $$;

-- Compañeras que tienen alguno de los turnos que le sirven (nombre y cuál de esos turnos).
-- Solo después de la pre aprobación. Las que ya dijeron que no, no aparecen.
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
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'turno', c.turno) ORDER BY c.name)
    FROM (
      SELECT w.id, w.name, public.worker_shift_on(w.id, r.fecha) AS turno
      FROM public.workers me
      JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
        AND w.id <> me.id AND w.estado = 'Activo'
      WHERE me.id = v_wid AND NOT (w.id = ANY (r.companeras_no))
    ) c
    WHERE c.turno = ANY (public.shift_request_opciones(r))
  ), '[]'::jsonb));
END $$;

-- Elige a la compañera y a ella le llega para aceptar. Queda con el turno que tiene la compañera.
CREATE OR REPLACE FUNCTION public.mis_turnos_request_pick(p_token TEXT, p_id UUID, p_companera TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  r public.shift_requests%ROWTYPE;
  v_suyo TEXT;
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
  IF p_companera = ANY (r.companeras_no) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa compañera ya dijo que no. Elige a otra.');
  END IF;
  v_suyo := public.worker_shift_on(p_companera, r.fecha);
  IF NOT EXISTS (SELECT 1 FROM public.workers me JOIN public.workers w
                   ON w.sucursal = me.sucursal AND w.cargo = me.cargo AND w.estado = 'Activo'
                 WHERE me.id = v_wid AND w.id = p_companera AND w.id <> me.id)
     OR NOT COALESCE(v_suyo = ANY (public.shift_request_opciones(r)), false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esa compañera ya no tiene ese turno ese día.');
  END IF;
  UPDATE public.shift_requests SET
    companera_id = p_companera,
    companera_status = 'pendiente',
    turno_pedido = v_suyo,
    turno_companera_antes = v_suyo,
    turno_actual = public.worker_shift_on(v_wid, r.fecha),
    -- El aviso de que la anterior no aceptó ya no hace falta
    respuesta = CASE WHEN respuesta LIKE '% no aceptó. Puedes elegir a otra compañera.' THEN ''
                     ELSE respuesta END
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- La compañera acepta o no. Si no acepta, la solicitud vuelve a «elige compañera»
-- para que pueda pedírselo a otra.
CREATE OR REPLACE FUNCTION public.mis_turnos_request_answer(p_token TEXT, p_id UUID, p_acepta BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_wid TEXT := public.mis_turnos_worker(p_token);
  v_nombre TEXT;
BEGIN
  IF v_wid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sesion');
  END IF;
  IF p_acepta THEN
    UPDATE public.shift_requests SET companera_status = 'aceptada'
    WHERE id = p_id AND companera_id = v_wid AND status = 'pendiente' AND companera_status = 'pendiente';
    RETURN jsonb_build_object('ok', FOUND);
  END IF;
  SELECT split_part(trim(name), ' ', 1) INTO v_nombre FROM public.workers WHERE id = v_wid;
  UPDATE public.shift_requests SET
    companera_status = 'elegir',
    companera_id = NULL,
    turno_companera_antes = '',
    companeras_no = array_append(companeras_no, v_wid),
    respuesta = COALESCE(NULLIF(v_nombre, ''), 'La compañera') || ' no aceptó. Puedes elegir a otra compañera.'
  WHERE id = p_id AND companera_id = v_wid AND status = 'pendiente' AND companera_status = 'pendiente';
  RETURN jsonb_build_object('ok', FOUND);
END $$;

-- Mientras espera a la compañera, se arrepiente y vuelve a elegir a otra
CREATE OR REPLACE FUNCTION public.mis_turnos_request_otra(p_token TEXT, p_id UUID)
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
    companera_status = 'elegir',
    companera_id = NULL,
    turno_companera_antes = ''
  WHERE id = p_id AND worker_id = v_wid AND status = 'pendiente'
    AND tipo = 'intercambio' AND companera_status = 'pendiente';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tu compañera ya respondió.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Sus solicitudes y las que le hicieron sus compañeras (ahora con los turnos que le sirven)
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
      AND r.fecha >= (now() AT TIME ZONE 'America/Santiago')::date - 60
  ), '[]'::jsonb));
END $$;

-- ─── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT[]),
  public.mis_turnos_coworkers(TEXT, UUID),
  public.mis_turnos_request_pick(TEXT, UUID, TEXT),
  public.mis_turnos_request_answer(TEXT, UUID, BOOLEAN),
  public.mis_turnos_request_otra(TEXT, UUID),
  public.mis_turnos_requests(TEXT)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.mis_turnos_request_create(TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT[]),
  public.mis_turnos_coworkers(TEXT, UUID),
  public.mis_turnos_request_pick(TEXT, UUID, TEXT),
  public.mis_turnos_request_answer(TEXT, UUID, BOOLEAN),
  public.mis_turnos_request_otra(TEXT, UUID),
  public.mis_turnos_requests(TEXT)
TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

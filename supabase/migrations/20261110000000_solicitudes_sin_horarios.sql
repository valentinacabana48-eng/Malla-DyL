-- ─── Cambio con compañera: sin mostrar el horario de las demás ────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • Al pedir un cambio con compañera, la lista solo trae el nombre de cada compañera,
--     ya no su horario.
--   • En sus solicitudes, quien pidió el cambio ya no recibe el turno con el que quedó
--     la compañera.
-- Solo reemplaza dos funciones. Se puede volver a ejecutar sin error.

-- Compañeras de su sucursal y cargo que trabajan ese día con otro horario (solo el nombre)
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
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
    FROM (
      SELECT w.id, w.name
      FROM public.workers me
      JOIN public.workers w ON w.sucursal = me.sucursal AND w.cargo = me.cargo
        AND w.id <> me.id AND w.estado = 'Activo'
      JOIN public.shifts sh ON sh.code = public.worker_shift_on(w.id, p_fecha)
      WHERE me.id = v_wid AND sh.start_time <> '' AND sh.code IS DISTINCT FROM v_mine
    ) c
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

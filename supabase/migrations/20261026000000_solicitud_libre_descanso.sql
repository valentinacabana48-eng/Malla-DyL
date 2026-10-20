-- ─── Día libre aprobado: marcar DESCANSO en la malla ────────────────────────
-- Al aprobar un día libre se escribía 'DESC' en schedule_data, pero la malla marca el
-- descanso como día especial 'DESCANSO' (special_days_v2) y 'DESC' no es un turno,
-- así que la casilla quedaba vacía. Ahora un descanso deja la casilla del turno vacía y
-- pone DESCANSO en los días especiales; un turno quita lo especial de ese día, como antes.
-- Se puede volver a ejecutar sin error.

CREATE OR REPLACE FUNCTION public.set_worker_shift_on(p_worker_id TEXT, p_fecha DATE, p_code TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_month TEXT := to_char(p_fecha, 'YYYY-MM');
  v_idx INT := EXTRACT(DAY FROM p_fecha)::INT - 1;
  v_len INT := EXTRACT(DAY FROM (date_trunc('month', p_fecha) + INTERVAL '1 month - 1 day'))::INT;
  v_desc BOOLEAN := p_code IN ('DESC', 'DESCANSO');
  v_days JSONB;
BEGIN
  SELECT days INTO v_days FROM public.schedule_data
  WHERE worker_id = p_worker_id AND month_key = v_month;
  v_days := COALESCE(v_days, '[]'::jsonb);
  WHILE jsonb_array_length(v_days) < v_len LOOP
    v_days := v_days || 'null'::jsonb;
  END LOOP;
  v_days := jsonb_set(v_days, ARRAY[v_idx::TEXT],
                      CASE WHEN v_desc THEN 'null'::jsonb ELSE to_jsonb(p_code) END);

  INSERT INTO public.schedule_data (month_key, worker_id, days, updated_at)
  VALUES (v_month, p_worker_id, v_days, now())
  ON CONFLICT (month_key, worker_id) DO UPDATE SET days = EXCLUDED.days, updated_at = now();

  IF v_desc THEN
    INSERT INTO public.special_days_v2 (month_key, worker_id, days, updated_at)
    VALUES (v_month, p_worker_id, jsonb_build_object(v_idx::TEXT, 'DESCANSO'), now())
    ON CONFLICT (month_key, worker_id) DO UPDATE
      SET days = public.special_days_v2.days || EXCLUDED.days, updated_at = now();
  ELSE
    UPDATE public.special_days_v2 SET days = days - v_idx::TEXT, updated_at = now()
    WHERE worker_id = p_worker_id AND month_key = v_month AND days ? v_idx::TEXT;
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.set_worker_shift_on(TEXT, DATE, TEXT)
FROM PUBLIC, anon, authenticated;

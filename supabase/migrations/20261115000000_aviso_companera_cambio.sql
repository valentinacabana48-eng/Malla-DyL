-- ─── Aviso al celular de la compañera cuando le piden un cambio de turno ─────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • Cuando una cajera elige a la compañera con quien cambiar (después de que la
--     jefatura lo pre aprueba), a la compañera le llega un aviso al celular:
--     «Ana te pide cambiar turno el sábado 15 de noviembre. Toca para responder.»
--   • Le llega solo si activó los avisos en Mis turnos (igual que los demás avisos).
--   • Lo que ya hacía este aviso en vivo (refrescar la pantalla) sigue igual.
-- Se puede volver a ejecutar sin error.

CREATE OR REPLACE FUNCTION public.tg_shift_requests_avisar()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row public.shift_requests;
  v_meses TEXT[] := ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                          'septiembre','octubre','noviembre','diciembre'];
  v_dias TEXT[] := ARRAY['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  v_nombre TEXT;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM public.mis_turnos_ping(v_row.worker_id);
  IF v_row.companera_id IS NOT NULL THEN
    PERFORM public.mis_turnos_ping(v_row.companera_id);
  END IF;

  -- La solicitud recién le llegó a la compañera: aviso a su celular
  IF TG_OP <> 'DELETE'
     AND NEW.companera_id IS NOT NULL
     AND NEW.companera_status = 'pendiente'
     AND NEW.status = 'pendiente'
     AND (TG_OP = 'INSERT'
          OR OLD.companera_status IS DISTINCT FROM 'pendiente'
          OR OLD.companera_id IS DISTINCT FROM NEW.companera_id)
     AND EXISTS (SELECT 1 FROM public.push_subscriptions WHERE worker_id = NEW.companera_id)
  THEN
    SELECT split_part(trim(name), ' ', 1) INTO v_nombre
    FROM public.workers WHERE id = NEW.worker_id;
    INSERT INTO public.push_queue (worker_id, title, body)
    VALUES (
      NEW.companera_id,
      'Mis turnos DyL',
      COALESCE(NULLIF(v_nombre, ''), 'Una compañera') || ' te pide cambiar turno el '
        || v_dias[extract(dow FROM NEW.fecha)::INT + 1] || ' '
        || extract(day FROM NEW.fecha)::INT || ' de '
        || v_meses[extract(month FROM NEW.fecha)::INT]
        || '. Toca para responder.'
    );
    PERFORM public.push_despachar();
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.tg_shift_requests_avisar() FROM PUBLIC, anon, authenticated;

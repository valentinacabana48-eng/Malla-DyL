-- ─── Claves de Mis turnos que se pueden volver a ver ───────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • Guarda, además de la clave cifrada, una copia legible (worker_pins.pin_visible).
--   • Solo se ve desde la app, y solo quien puede editar a esa trabajadora (Personal).
--   • Las claves que ya existen no se pueden recuperar: se verán las que se creen o
--     cambien desde ahora.
-- Solo agrega una columna y funciones (sin DROP). Se puede volver a ejecutar sin error.

ALTER TABLE public.worker_pins ADD COLUMN IF NOT EXISTS pin_visible TEXT;

-- Igual que antes, pero además guarda la copia legible
CREATE OR REPLACE FUNCTION public.set_worker_pin(p_worker_id TEXT, p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF NOT public.can_worker(p_worker_id, 'personal_editar') THEN
    RAISE EXCEPTION 'Sin permiso para cambiar la clave de esta trabajadora';
  END IF;

  DELETE FROM public.worker_sessions WHERE worker_id = p_worker_id;

  IF p_pin IS NULL THEN
    DELETE FROM public.worker_pins WHERE worker_id = p_worker_id;
    RETURN;
  END IF;
  IF p_pin !~ '^[0-9]{4,6}$' THEN
    RAISE EXCEPTION 'La clave debe tener de 4 a 6 números';
  END IF;

  INSERT INTO public.worker_pins (worker_id, pin_hash, pin_visible)
  VALUES (p_worker_id, crypt(p_pin, gen_salt('bf', 8)), p_pin)
  ON CONFLICT (worker_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, pin_visible = EXCLUDED.pin_visible,
        failed_attempts = 0, locked_until = NULL, updated_at = now();
END $$;

-- Claves legibles de esas trabajadoras (solo las que esta persona puede editar)
CREATE OR REPLACE FUNCTION public.worker_pin_visible(p_worker_ids TEXT[])
RETURNS TABLE (r_worker_id TEXT, r_pin TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.worker_id, p.pin_visible
  FROM public.worker_pins p
  WHERE p.worker_id = ANY(p_worker_ids)
    AND p.pin_visible IS NOT NULL
    AND public.can_worker(p.worker_id, 'personal_editar')
$$;

-- Solo para las admins con sesión iniciada
REVOKE EXECUTE ON FUNCTION public.worker_pin_visible(TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_pin_visible(TEXT[]) TO authenticated;

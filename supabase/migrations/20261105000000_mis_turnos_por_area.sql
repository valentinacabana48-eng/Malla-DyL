-- ─── Acceso a Mis turnos por área ───────────────────────────────────────────
-- En Ajustes > Áreas se elige qué áreas entran a Mis turnos (todas parten con acceso,
-- así nada cambia hasta que se apague una). Si el área no tiene acceso, sus trabajadoras
-- no pueden entrar aunque tengan clave, y las que ya estaban dentro quedan fuera.
-- Excepción: en Personal se le puede dar acceso a una trabajadora aunque su área no tenga.
-- Solo agrega columnas y reemplaza funciones (sin DROP). Se puede volver a ejecutar sin error.

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS mis_turnos BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.workers ADD COLUMN IF NOT EXISTS mis_turnos_excepcion BOOLEAN NOT NULL DEFAULT false;

-- ¿La trabajadora puede usar Mis turnos? (un área que no está en la lista cuenta como con acceso)
CREATE OR REPLACE FUNCTION public.mis_turnos_permitido(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT w.mis_turnos_excepcion
            OR COALESCE((SELECT a.mis_turnos FROM public.areas a WHERE a.name = w.area), true)
     FROM public.workers w WHERE w.id = p_worker_id),
    false)
$$;

-- Trabajadora de una sesión vigente (NULL si el token no sirve o su área ya no tiene acceso)
CREATE OR REPLACE FUNCTION public.mis_turnos_worker(p_token TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT s.worker_id
  FROM public.worker_sessions s
  JOIN public.workers w ON w.id = s.worker_id
  WHERE s.token_hash = encode(digest(COALESCE(p_token, ''), 'sha256'), 'hex')
    AND s.expires_at > now()
    AND w.estado = 'Activo'
    AND public.mis_turnos_permitido(w.id)
$$;

-- Ingreso de la trabajadora. Igual que antes, más el error 'sin_acceso' cuando el RUT y la
-- clave están bien pero su área no tiene Mis turnos (solo se dice con la clave correcta).
CREATE OR REPLACE FUNCTION public.mis_turnos_login(p_rut TEXT, p_pin TEXT, p_remember BOOLEAN DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_rut TEXT := public.normalize_rut(p_rut);
  c RECORD;
  v_locked BOOLEAN := false;
  v_sin_acceso BOOLEAN := false;
  v_token TEXT;
  v_expires TIMESTAMPTZ;
BEGIN
  IF v_rut = '' OR p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'datos');
  END IF;

  DELETE FROM public.worker_sessions WHERE expires_at < now();

  FOR c IN
    SELECT w.id, p.pin_hash, p.failed_attempts, p.locked_until
    FROM public.workers w
    JOIN public.worker_pins p ON p.worker_id = w.id
    WHERE public.normalize_rut(w.rut) = v_rut AND w.estado = 'Activo'
    FOR UPDATE OF p
  LOOP
    IF c.locked_until IS NOT NULL AND c.locked_until > now() THEN
      v_locked := true;
      CONTINUE;
    END IF;

    IF c.pin_hash = crypt(p_pin, c.pin_hash) THEN
      UPDATE public.worker_pins SET failed_attempts = 0, locked_until = NULL WHERE worker_id = c.id;
      IF NOT public.mis_turnos_permitido(c.id) THEN
        v_sin_acceso := true;
        CONTINUE;
      END IF;
      v_token := encode(gen_random_bytes(32), 'hex');
      v_expires := now() + CASE WHEN p_remember THEN INTERVAL '120 days' ELSE INTERVAL '12 hours' END;
      INSERT INTO public.worker_sessions (token_hash, worker_id, expires_at)
      VALUES (encode(digest(v_token, 'sha256'), 'hex'), c.id, v_expires);
      RETURN jsonb_build_object('ok', true, 'token', v_token, 'expires_at', v_expires);
    END IF;

    -- 5 intentos fallidos: 15 minutos bloqueada y vuelve a contar desde cero
    IF c.failed_attempts + 1 >= 5 THEN
      UPDATE public.worker_pins
      SET failed_attempts = 0, locked_until = now() + INTERVAL '15 minutes'
      WHERE worker_id = c.id;
      v_locked := true;
    ELSE
      UPDATE public.worker_pins SET failed_attempts = failed_attempts + 1 WHERE worker_id = c.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'error',
    CASE WHEN v_sin_acceso THEN 'sin_acceso' WHEN v_locked THEN 'bloqueada' ELSE 'datos' END);
END $$;

-- Interna: solo la usan las otras funciones
REVOKE EXECUTE ON FUNCTION public.mis_turnos_permitido(TEXT) FROM PUBLIC, anon, authenticated;

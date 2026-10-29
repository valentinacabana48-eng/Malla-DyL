-- ─── Áreas por sucursal y acceso a Mis turnos por sucursal y cargo ─────────────
-- Cómo usarlo:
--   1. Entra a supabase.com, abre el proyecto «Dyl Mallas».
--   2. En el menú de la izquierda toca «SQL Editor» y luego «New query».
--   3. Copia TODO este archivo, pégalo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • areas.sucursales: en qué sucursales existe el área (vacío = todas).
--   • areas.mis_turnos_sucursales / mis_turnos_cargos: si el área tiene Mis turnos,
--     quiénes entran (vacío = todas las sucursales / todos los cargos).
--   • Actualiza la revisión de acceso a Mis turnos para que use esos límites. Las
--     trabajadoras que queden fuera salen solas de Mis turnos.
-- Todo parte vacío, así que nada cambia hasta que lo ajustes en Ajustes › Áreas.
-- Solo agrega columnas y reemplaza una función (sin DROP). Se puede volver a ejecutar sin error.

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS sucursales TEXT[];
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS mis_turnos_sucursales TEXT[];
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS mis_turnos_cargos TEXT[];

-- ¿La trabajadora puede usar Mis turnos? Excepción personal, o su área tiene acceso y
-- (si el área tiene límites) su sucursal y su cargo están en la lista.
-- Un área que no está en la lista cuenta como con acceso, igual que antes.
CREATE OR REPLACE FUNCTION public.mis_turnos_permitido(p_worker_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT w.mis_turnos_excepcion
            OR COALESCE(
                 (SELECT a.mis_turnos
                         AND (COALESCE(cardinality(a.mis_turnos_sucursales), 0) = 0
                              OR COALESCE(w.sucursal = ANY (a.mis_turnos_sucursales), false))
                         AND (COALESCE(cardinality(a.mis_turnos_cargos), 0) = 0
                              OR COALESCE(w.cargo = ANY (a.mis_turnos_cargos), false))
                  FROM public.areas a WHERE a.name = w.area),
                 true)
     FROM public.workers w WHERE w.id = p_worker_id),
    false)
$$;

-- Interna: solo la usan las otras funciones
REVOKE EXECUTE ON FUNCTION public.mis_turnos_permitido(TEXT) FROM PUBLIC, anon, authenticated;

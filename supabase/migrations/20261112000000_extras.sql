-- ─── Extras del día ─────────────────────────────────────────────────────────
-- Módulo "Extras": se elige un día y una sucursal, se ve quién trabaja y se agregan
-- extras (una persona de la lista o alguien de afuera) con su horario y el valor a pagar.
-- Se imprime el horario del día marcando los EXTRA y una hoja con quién cobra y su firma.
-- Solo agrega una tabla nueva: no cambia ni borra nada de lo que ya existe.
-- Para deshacer: DROP TABLE public.extras;
-- Se puede volver a ejecutar sin error.

CREATE TABLE IF NOT EXISTS public.extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  sucursal TEXT NOT NULL,
  -- Si es alguien del personal; NULL si es una persona de afuera
  worker_id TEXT REFERENCES public.workers(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL CHECK (btrim(nombre) <> ''),
  rut TEXT NOT NULL DEFAULT '',
  -- Qué hace en el extra (cargo o tarea), opcional
  cargo TEXT NOT NULL DEFAULT '',
  inicio TIME NOT NULL,
  fin TIME NOT NULL,
  -- Pesos chilenos
  monto INTEGER NOT NULL DEFAULT 0 CHECK (monto >= 0),
  nota TEXT NOT NULL DEFAULT '',
  created_by UUID DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS extras_fecha_sucursal ON public.extras (fecha, sucursal);
ALTER TABLE public.extras ENABLE ROW LEVEL SECURITY;

-- Lo ve y lo edita quien tiene la casilla "Extras" (las administradoras siempre),
-- solo en sus sucursales
DROP POLICY IF EXISTS extras_read ON public.extras;
CREATE POLICY extras_read ON public.extras FOR SELECT TO authenticated
  USING (public.has_perm('extras') AND public.in_my_sucursales(sucursal));
DROP POLICY IF EXISTS extras_insert ON public.extras;
CREATE POLICY extras_insert ON public.extras FOR INSERT TO authenticated
  WITH CHECK (public.has_perm('extras') AND public.in_my_sucursales(sucursal));
DROP POLICY IF EXISTS extras_update ON public.extras;
CREATE POLICY extras_update ON public.extras FOR UPDATE TO authenticated
  USING (public.has_perm('extras') AND public.in_my_sucursales(sucursal))
  WITH CHECK (public.has_perm('extras') AND public.in_my_sucursales(sucursal));
DROP POLICY IF EXISTS extras_delete ON public.extras;
CREATE POLICY extras_delete ON public.extras FOR DELETE TO authenticated
  USING (public.has_perm('extras') AND public.in_my_sucursales(sucursal));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extras TO authenticated;

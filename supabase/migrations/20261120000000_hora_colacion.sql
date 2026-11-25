-- ─── Hora de colación ────────────────────────────────────────────────────────
-- Cómo usarlo:
--   1. Entra a supabase.com y abre el proyecto «Dyl Mallas».
--   2. Toca «SQL Editor» y luego «New query».
--   3. Pega TODO este archivo y toca «Run».
--   4. Debe decir «Success. No rows returned».
--
-- Qué hace:
--   • Ajustes > Áreas: cada área puede tener una hora de colación fija para cada turno,
--     para todas las sucursales o distinta en cada sucursal
--     (p. ej. en Cajas, quien entra a las 08:00 sale a colación a las 13:00).
--   • Malla: en la casilla de un día se puede elegir otra hora para esa persona ese día.
--     Si después se le cambia el turno, esa hora deja de usarse y vuelve la del área.
-- Solo agrega una columna y una tabla nueva: no cambia ni borra datos.
-- Se puede volver a ejecutar sin error.
-- Para deshacer: DROP TABLE public.colacion_dia; ALTER TABLE public.areas DROP COLUMN colacion_horas;

-- Hora fija por sucursal y turno en cada área ("*" = todas las sucursales):
--   { "*": { "M1": "13:00" }, "Casa Matriz": { "M1": "13:30" } }
ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS colacion_horas JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Hora elegida en la malla para una persona un día (vale solo mientras tenga ese turno)
CREATE TABLE IF NOT EXISTS public.colacion_dia (
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  month_key TEXT NOT NULL CHECK (month_key ~ '^\d{4}-\d{2}$'),
  turno TEXT NOT NULL,
  hora TEXT NOT NULL CHECK (hora ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, fecha)
);
CREATE INDEX IF NOT EXISTS colacion_dia_month_key ON public.colacion_dia (month_key);
ALTER TABLE public.colacion_dia ENABLE ROW LEVEL SECURITY;

-- Igual que los turnos de la malla: la ve quien ve la malla de esa trabajadora y ese mes,
-- y la cambia quien puede editarla
DROP POLICY IF EXISTS colacion_dia_read ON public.colacion_dia;
CREATE POLICY colacion_dia_read ON public.colacion_dia FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id) AND public.can_see_month(worker_id, month_key));
DROP POLICY IF EXISTS colacion_dia_insert ON public.colacion_dia;
CREATE POLICY colacion_dia_insert ON public.colacion_dia FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));
DROP POLICY IF EXISTS colacion_dia_update ON public.colacion_dia;
CREATE POLICY colacion_dia_update ON public.colacion_dia FOR UPDATE TO authenticated
  USING (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key))
  WITH CHECK (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));
DROP POLICY IF EXISTS colacion_dia_delete ON public.colacion_dia;
CREATE POLICY colacion_dia_delete ON public.colacion_dia FOR DELETE TO authenticated
  USING (public.can_edit_worker(worker_id) AND public.can_see_month(worker_id, month_key));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.colacion_dia TO authenticated;

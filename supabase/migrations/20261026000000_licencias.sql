-- ─── Licencias ───────────────────────────────────────────────────────────────
-- Se registran desde la Malla con la fecha de inicio y la cantidad de días (corridos).
-- Esos días quedan como LICENCIA en la malla y aquí se guarda el turno que la persona
-- tenía programado cada día, para mostrarlo y para devolverlo si se quita la licencia.
-- Al volver aparece un aviso en la Malla hasta que alguien elige qué hacer.
-- Se puede volver a ejecutar sin error.

CREATE TABLE IF NOT EXISTS public.licencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  desde DATE NOT NULL,
  dias INT NOT NULL CHECK (dias BETWEEN 1 AND 366),
  -- Último día de licencia (la persona vuelve el día siguiente)
  hasta DATE GENERATED ALWAYS AS (desde + dias - 1) STORED,
  -- Lo que había en la malla antes: { "2026-10-22": "M1" } y { "2026-10-25": "DESCANSO" }
  turnos JSONB NOT NULL DEFAULT '{}'::jsonb,
  especiales JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Ya se eligió qué hacer con sus turnos al volver
  aviso_resuelto BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licencias_worker ON public.licencias (worker_id, desde);
ALTER TABLE public.licencias ENABLE ROW LEVEL SECURITY;

-- Mismos permisos que la malla: la ve quien ve a la trabajadora y la edita quien edita su malla
DROP POLICY IF EXISTS licencias_read ON public.licencias;
CREATE POLICY licencias_read ON public.licencias FOR SELECT TO authenticated
  USING (public.can_see_worker(worker_id));
DROP POLICY IF EXISTS licencias_insert ON public.licencias;
CREATE POLICY licencias_insert ON public.licencias FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_worker(worker_id));
DROP POLICY IF EXISTS licencias_update ON public.licencias;
CREATE POLICY licencias_update ON public.licencias FOR UPDATE TO authenticated
  USING (public.can_edit_worker(worker_id)) WITH CHECK (public.can_edit_worker(worker_id));
DROP POLICY IF EXISTS licencias_delete ON public.licencias;
CREATE POLICY licencias_delete ON public.licencias FOR DELETE TO authenticated
  USING (public.can_edit_worker(worker_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.licencias TO authenticated;

-- Realtime: que el aviso y la malla se actualicen en todos los equipos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'licencias') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.licencias;
  END IF;
END $$;

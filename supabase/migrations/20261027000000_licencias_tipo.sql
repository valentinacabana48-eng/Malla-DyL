-- ─── Permisos y vacaciones en la misma tabla que las licencias ───────────────
-- tipo: LICENCIA, PERMISO_CG (con goce), PERMISO_SG (sin goce) o VACACIONES.
-- motivo: lo que pidió la trabajadora; sale en la hoja de permiso para firmar.
-- Se puede volver a ejecutar sin error.

ALTER TABLE public.licencias ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'LICENCIA';
ALTER TABLE public.licencias ADD COLUMN IF NOT EXISTS motivo TEXT NOT NULL DEFAULT '';
ALTER TABLE public.licencias DROP CONSTRAINT IF EXISTS licencias_tipo_check;
ALTER TABLE public.licencias ADD CONSTRAINT licencias_tipo_check
  CHECK (tipo IN ('LICENCIA', 'PERMISO_CG', 'PERMISO_SG', 'VACACIONES'));

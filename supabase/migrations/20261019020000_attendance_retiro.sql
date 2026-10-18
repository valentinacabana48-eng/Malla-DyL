-- Retiro anticipado: horas a descontar del día y motivo.
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS retiro_horas NUMERIC(4,1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retiro_motivo TEXT NOT NULL DEFAULT '';

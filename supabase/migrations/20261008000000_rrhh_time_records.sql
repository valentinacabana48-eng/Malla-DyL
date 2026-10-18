-- Migration: Create rrhh_time_records table for storing real entry/exit times
CREATE TABLE IF NOT EXISTS public.rrhh_time_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id text NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  month_key text NOT NULL,
  entrada_real time,
  salida_real time,
  entrada_colacion time,
  salida_colacion time,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT rrhh_time_records_worker_date_unique UNIQUE (worker_id, record_date)
);

-- Enable RLS
ALTER TABLE public.rrhh_time_records ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anonymous users
DROP POLICY IF EXISTS "Allow all rrhh_time_records" ON public.rrhh_time_records;
CREATE POLICY "Allow all rrhh_time_records" ON public.rrhh_time_records
  FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rrhh_time_records_month_key ON public.rrhh_time_records(month_key);
CREATE INDEX IF NOT EXISTS idx_rrhh_time_records_worker_id ON public.rrhh_time_records(worker_id);

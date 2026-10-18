-- ─── Attendance Records ───────────────────────────────────────────────────────
-- Stores daily attendance per worker per period (22nd to 22nd)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  record_date TEXT NOT NULL,        -- "YYYY-MM-DD"
  period_key TEXT NOT NULL,         -- "2026-07" (period starting 22nd of that month)
  status TEXT NOT NULL DEFAULT 'PRESENTE',
  -- PRESENTE | AUSENTE | DESCANSO | LICENCIA | PERMISO | VACACIONES | CUMPLEANOS
  absence_reason TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worker_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON public.attendance_records(worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_record_date ON public.attendance_records(record_date);
CREATE INDEX IF NOT EXISTS idx_attendance_period_key ON public.attendance_records(period_key);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_attendance_records" ON public.attendance_records;
CREATE POLICY "open_access_attendance_records"
ON public.attendance_records
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- ─── Overtime Hours ────────────────────────────────────────────────────────────
-- Stores overtime (HE) hours per worker per day
CREATE TABLE IF NOT EXISTS public.overtime_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id TEXT NOT NULL,
  record_date TEXT NOT NULL,        -- "YYYY-MM-DD"
  period_key TEXT NOT NULL,         -- "2026-07"
  hours NUMERIC(4,1) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(worker_id, record_date)
);

CREATE INDEX IF NOT EXISTS idx_overtime_worker_id ON public.overtime_hours(worker_id);
CREATE INDEX IF NOT EXISTS idx_overtime_record_date ON public.overtime_hours(record_date);
CREATE INDEX IF NOT EXISTS idx_overtime_period_key ON public.overtime_hours(period_key);

ALTER TABLE public.overtime_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_overtime_hours" ON public.overtime_hours;
CREATE POLICY "open_access_overtime_hours"
ON public.overtime_hours
FOR ALL
TO public
USING (true)
WITH CHECK (true);

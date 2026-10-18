-- ─── Attendance Locked Dates ─────────────────────────────────────────────────
-- Stores which dates have been locked (no modifications allowed without PIN)
CREATE TABLE IF NOT EXISTS public.attendance_locked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_date TEXT NOT NULL,        -- "YYYY-MM-DD"
  locked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(record_date)
);

CREATE INDEX IF NOT EXISTS idx_locked_dates_record_date ON public.attendance_locked_dates(record_date);

ALTER TABLE public.attendance_locked_dates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "open_access_attendance_locked_dates" ON public.attendance_locked_dates;
CREATE POLICY "open_access_attendance_locked_dates"
ON public.attendance_locked_dates
FOR ALL
TO public
USING (true)
WITH CHECK (true);

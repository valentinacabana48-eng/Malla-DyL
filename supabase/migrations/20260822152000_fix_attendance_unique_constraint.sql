-- ─── Fix attendance_records: ensure unique constraint on (worker_id, record_date) ───
-- The original migration declared UNIQUE(worker_id, record_date) but the constraint
-- may not have been applied. This migration deduplicates existing rows and adds
-- the constraint so upsert onConflict works correctly.

-- Step 1: Remove duplicate rows, keeping only the most recently updated one per (worker_id, record_date)
DELETE FROM public.attendance_records
WHERE id NOT IN (
  SELECT DISTINCT ON (worker_id, record_date) id
  FROM public.attendance_records
  ORDER BY worker_id, record_date, updated_at DESC NULLS LAST
);

-- Step 2: Remove duplicate rows from overtime_hours as well
DELETE FROM public.overtime_hours
WHERE id NOT IN (
  SELECT DISTINCT ON (worker_id, record_date) id
  FROM public.overtime_hours
  ORDER BY worker_id, record_date, updated_at DESC NULLS LAST
);

-- Step 3: Drop old constraint if it exists (idempotent)
ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_worker_id_record_date_key;

-- Step 4: Add the unique constraint that upsert depends on
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_worker_id_record_date_key
  UNIQUE (worker_id, record_date);

-- Step 5: Same for overtime_hours
ALTER TABLE public.overtime_hours
  DROP CONSTRAINT IF EXISTS overtime_hours_worker_id_record_date_key;

ALTER TABLE public.overtime_hours
  ADD CONSTRAINT overtime_hours_worker_id_record_date_key
  UNIQUE (worker_id, record_date);

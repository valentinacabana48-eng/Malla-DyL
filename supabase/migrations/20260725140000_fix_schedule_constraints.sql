-- Fix: Add named unique constraints so Supabase upsert onConflict works correctly
-- The previous UNIQUE(...) inline constraints exist but PostgREST needs named constraints
-- for upsert onConflict to resolve properly.

-- Drop old unnamed unique constraints and recreate as named constraints
-- for schedule_data
DO $$
BEGIN
  -- Add named unique constraint if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schedule_data_month_key_worker_id_key'
      AND conrelid = 'public.schedule_data'::regclass
  ) THEN
    ALTER TABLE public.schedule_data
      ADD CONSTRAINT schedule_data_month_key_worker_id_key UNIQUE (month_key, worker_id);
  END IF;
END $$;

-- for special_days
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'special_days_month_key_worker_id_day_index_key'
      AND conrelid = 'public.special_days'::regclass
  ) THEN
    ALTER TABLE public.special_days
      ADD CONSTRAINT special_days_month_key_worker_id_day_index_key UNIQUE (month_key, worker_id, day_index);
  END IF;
END $$;

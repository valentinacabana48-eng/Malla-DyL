-- Fix: deduplicate special_days rows and enforce unique constraint
-- Some workers (e.g. Rosa Figueroa, Yesenia, Javiera Corales, Brendu Requena)
-- had duplicate rows because the upsert onConflict target didn't match an actual
-- DB constraint, so every save created a new INSERT instead of updating.
-- On reload, the last-inserted row (often a different type_code) would win,
-- making descansos appear to disappear.

-- Step 1: Remove duplicate rows, keeping only the most recently updated one
-- for each (month_key, worker_id, day_index) combination.
DELETE FROM public.special_days
WHERE id NOT IN (
  SELECT DISTINCT ON (month_key, worker_id, day_index) id
  FROM public.special_days
  ORDER BY month_key, worker_id, day_index, updated_at DESC NULLS LAST
);

-- Step 2: Add the unique constraint so future upserts work correctly
ALTER TABLE public.special_days
  DROP CONSTRAINT IF EXISTS special_days_month_key_worker_id_day_index_key;

ALTER TABLE public.special_days
  ADD CONSTRAINT special_days_month_key_worker_id_day_index_key
  UNIQUE (month_key, worker_id, day_index);

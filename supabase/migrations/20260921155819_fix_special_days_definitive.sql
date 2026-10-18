-- ─── Definitive fix for special_days persistence ─────────────────────────────
-- Problem: special_days table had no unique constraint on (month_key, worker_id, day_index).
-- Every save did DELETE + INSERT, but duplicate rows accumulated over time.
-- On reload, multiple rows for the same cell were read and the last one processed
-- could be wrong, making descansos appear to disappear.
--
-- Fix:
--   1. Remove ALL duplicate rows, keeping only the most recently updated one.
--   2. Drop any existing partial unique constraint (from previous migration attempts).
--   3. Add a definitive UNIQUE constraint on (month_key, worker_id, day_index).

-- Step 1: Deduplicate — keep only the row with the highest updated_at per cell
DELETE FROM public.special_days
WHERE id NOT IN (
  SELECT DISTINCT ON (month_key, worker_id, day_index) id
  FROM public.special_days
  ORDER BY month_key, worker_id, day_index, updated_at DESC NULLS LAST, id DESC
);

-- Step 2: Drop any previous constraint attempt (idempotent)
ALTER TABLE public.special_days
  DROP CONSTRAINT IF EXISTS special_days_month_key_worker_id_day_index_key;

-- Step 3: Add the definitive unique constraint
ALTER TABLE public.special_days
  ADD CONSTRAINT special_days_month_key_worker_id_day_index_key
  UNIQUE (month_key, worker_id, day_index);

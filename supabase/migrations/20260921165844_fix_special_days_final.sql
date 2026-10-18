-- ─── Final fix for special_days persistence ──────────────────────────────────
-- Root cause: The unique constraint on (month_key, worker_id, day_index) was
-- never successfully applied in the live database. As a result, every upsert
-- with onConflict silently fell back to INSERT, creating duplicate rows.
-- On reload, the wrong row would win, making descansos disappear for some workers.
--
-- This migration:
--   1. Drops ALL previous constraint/index attempts (idempotent)
--   2. Deduplicates ALL existing rows, keeping the most recent per cell
--   3. Adds a definitive UNIQUE INDEX (more reliable than ADD CONSTRAINT in Supabase)

-- Step 1: Drop any previous constraint or index attempts
ALTER TABLE public.special_days
  DROP CONSTRAINT IF EXISTS special_days_month_key_worker_id_day_index_key;

DROP INDEX IF EXISTS public.special_days_month_key_worker_id_day_index_key;
DROP INDEX IF EXISTS public.idx_special_days_unique_cell;
DROP INDEX IF EXISTS public.special_days_unique_cell_idx;

-- Step 2: Deduplicate — keep only the row with the highest updated_at per cell
-- Using a CTE to safely identify which rows to delete
DELETE FROM public.special_days
WHERE id NOT IN (
  SELECT DISTINCT ON (month_key, worker_id, day_index) id
  FROM public.special_days
  ORDER BY month_key, worker_id, day_index,
           updated_at DESC NULLS LAST,
           id DESC
);

-- Step 3: Add definitive unique index
CREATE UNIQUE INDEX idx_special_days_unique_cell
  ON public.special_days (month_key, worker_id, day_index);

-- ─── Fix special_days_v2: add missing unique constraint ──────────────────────
-- ROOT CAUSE: The table was created by a previous migration attempt that ran
-- CREATE TABLE IF NOT EXISTS — but the table already existed at that point,
-- so the CONSTRAINT clause inside CREATE TABLE was NEVER applied.
-- Result: onConflict: 'month_key,worker_id' upserts silently created new rows
-- instead of updating, causing duplicate rows and data loss on reload.
--
-- This migration:
--   1. Deduplicates all existing rows (keep most recent per worker+month)
--   2. Drops any previous partial index attempts
--   3. Adds the definitive UNIQUE INDEX on (month_key, worker_id)

-- Step 1: Deduplicate — keep only the row with the highest updated_at per (month_key, worker_id)
DELETE FROM public.special_days_v2
WHERE id NOT IN (
  SELECT DISTINCT ON (month_key, worker_id) id
  FROM public.special_days_v2
  ORDER BY month_key, worker_id, updated_at DESC NULLS LAST, id DESC
);

-- Step 2: Drop any previous constraint or index attempts (idempotent)
ALTER TABLE public.special_days_v2
  DROP CONSTRAINT IF EXISTS special_days_v2_unique_cell;

DROP INDEX IF EXISTS public.special_days_v2_unique_cell;
DROP INDEX IF EXISTS public.idx_special_days_v2_unique;

-- Step 3: Add definitive unique index on (month_key, worker_id)
-- Using CREATE UNIQUE INDEX (more reliable than ADD CONSTRAINT in Supabase)
CREATE UNIQUE INDEX IF NOT EXISTS idx_special_days_v2_month_worker
  ON public.special_days_v2 (month_key, worker_id);

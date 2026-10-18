-- ─── special_days_v2: reliable JSONB-per-row storage ─────────────────────────
-- New approach: one row per (month_key, worker_id) storing all day assignments
-- as a JSONB object { "0": "DESCANSO", "5": "LICENCIA", ... }
-- This mirrors how schedule_data works and eliminates duplicate-row issues.

CREATE TABLE IF NOT EXISTS public.special_days_v2 (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key   text        NOT NULL,
  worker_id   text        NOT NULL,
  days        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT special_days_v2_unique_cell UNIQUE (month_key, worker_id)
);

ALTER TABLE public.special_days_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "special_days_v2_open" ON public.special_days_v2;
CREATE POLICY "special_days_v2_open"
  ON public.special_days_v2
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

-- Migrate existing data from special_days into special_days_v2
-- Group all rows by (month_key, worker_id) and aggregate into a JSONB object
INSERT INTO public.special_days_v2 (month_key, worker_id, days)
SELECT
  month_key,
  worker_id,
  jsonb_object_agg(day_index::text, type_code) AS days
FROM (
  -- Deduplicate: keep only the most recent row per cell
  SELECT DISTINCT ON (month_key, worker_id, day_index)
    month_key, worker_id, day_index, type_code
  FROM public.special_days
  ORDER BY month_key, worker_id, day_index,
           updated_at DESC NULLS LAST,
           id DESC
) deduped
GROUP BY month_key, worker_id
ON CONFLICT (month_key, worker_id) DO UPDATE
  SET days = EXCLUDED.days,
      updated_at = CURRENT_TIMESTAMP;

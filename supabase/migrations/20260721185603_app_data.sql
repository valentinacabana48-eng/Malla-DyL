-- ─── Workers ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  rut TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT '',
  sucursal TEXT NOT NULL DEFAULT '',
  area TEXT NOT NULL DEFAULT '',
  horas_contratadas INTEGER NOT NULL DEFAULT 42,
  estado TEXT NOT NULL DEFAULT 'Activo',
  avatar_color TEXT NOT NULL DEFAULT '',
  birthday TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Shifts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shifts (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  start_time TEXT NOT NULL DEFAULT '',
  end_time TEXT NOT NULL DEFAULT '',
  color_class TEXT NOT NULL DEFAULT '',
  legend_color TEXT NOT NULL DEFAULT '',
  colacion INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Sucursales ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sucursales (
  name TEXT PRIMARY KEY,
  cajas INTEGER NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Areas ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.areas (
  name TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Area Cargos ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.area_cargos (
  area_name TEXT PRIMARY KEY,
  cargos JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Custom Non-Working Types ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_non_working_types (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  color_class TEXT NOT NULL DEFAULT '',
  legend_color TEXT NOT NULL DEFAULT '',
  max_days_per_month INTEGER,
  icon TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Schedule Data ────────────────────────────────────────────────────────────
-- month_key: "2026-07", worker_id, days: array of 31 ShiftCode values (null or string)
CREATE TABLE IF NOT EXISTS public.schedule_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  days JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(month_key, worker_id)
);

-- ─── Special Days ─────────────────────────────────────────────────────────────
-- month_key: "2026-07", worker_id, day_index (0-30), type_code
CREATE TABLE IF NOT EXISTS public.special_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_key TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  day_index INTEGER NOT NULL,
  type_code TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(month_key, worker_id, day_index)
);

-- ─── App Settings (selected month, etc.) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_schedule_data_month_key ON public.schedule_data(month_key);
CREATE INDEX IF NOT EXISTS idx_schedule_data_worker_id ON public.schedule_data(worker_id);
CREATE INDEX IF NOT EXISTS idx_special_days_month_key ON public.special_days(month_key);
CREATE INDEX IF NOT EXISTS idx_special_days_worker_id ON public.special_days(worker_id);

-- ─── Enable RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_non_working_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies (public access - shared workspace) ─────────────────────────
DROP POLICY IF EXISTS "public_all_workers" ON public.workers;
CREATE POLICY "public_all_workers" ON public.workers FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_shifts" ON public.shifts;
CREATE POLICY "public_all_shifts" ON public.shifts FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_sucursales" ON public.sucursales;
CREATE POLICY "public_all_sucursales" ON public.sucursales FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_areas" ON public.areas;
CREATE POLICY "public_all_areas" ON public.areas FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_area_cargos" ON public.area_cargos;
CREATE POLICY "public_all_area_cargos" ON public.area_cargos FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_custom_nwt" ON public.custom_non_working_types;
CREATE POLICY "public_all_custom_nwt" ON public.custom_non_working_types FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_schedule_data" ON public.schedule_data;
CREATE POLICY "public_all_schedule_data" ON public.schedule_data FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_special_days" ON public.special_days;
CREATE POLICY "public_all_special_days" ON public.special_days FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public_all_app_settings" ON public.app_settings;
CREATE POLICY "public_all_app_settings" ON public.app_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- ─── Seed default data ────────────────────────────────────────────────────────
INSERT INTO public.sucursales (name, cajas) VALUES
  ('Mayorista Talca', 20),
  ('Mayorista Curicó', 20),
  ('Mayorista Linares', 20),
  ('Mayorista Rancagua', 20)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.areas (name) VALUES
  ('Cajas'),
  ('Tesorería'),
  ('Supermercado'),
  ('Bodega')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.app_settings (key, value) VALUES
  ('selected_mes', 'Julio 2026')
ON CONFLICT (key) DO NOTHING;

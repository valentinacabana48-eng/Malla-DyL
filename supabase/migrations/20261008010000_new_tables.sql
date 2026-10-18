-- 1. RRHH time records (already exists from previous migration, adding IF NOT EXISTS safety)
CREATE TABLE IF NOT EXISTS rrhh_time_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id TEXT NOT NULL,
  record_date DATE NOT NULL,
  month_key TEXT DEFAULT '',
  entrada_real TEXT DEFAULT '',
  salida_real TEXT DEFAULT '',
  entrada_colacion TEXT DEFAULT '',
  salida_colacion TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(worker_id, record_date)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rrhh_time_records' AND policyname = 'Allow all'
  ) THEN
    ALTER TABLE rrhh_time_records ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all" ON rrhh_time_records FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. Attendance reports
CREATE TABLE IF NOT EXISTS attendance_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  report_data JSONB NOT NULL,
  created_by TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'attendance_reports' AND policyname = 'Allow all'
  ) THEN
    ALTER TABLE attendance_reports ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all" ON attendance_reports FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 3. Attendance HE columns
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS he_hours NUMERIC DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS he_reason TEXT DEFAULT '';

-- 4. App settings (PIN)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'app_settings' AND policyname = 'Allow all'
  ) THEN
    ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Allow all" ON app_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

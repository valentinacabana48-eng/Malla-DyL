-- PIN settings table for admin and readonly access
CREATE TABLE IF NOT EXISTS public.pin_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  admin_pin TEXT NOT NULL DEFAULT '1895',
  readonly_pin TEXT NOT NULL DEFAULT '2075',
  recovery_email TEXT NOT NULL DEFAULT 'valentinacabana48@gmail.com',
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.pin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pin_settings_open_access" ON public.pin_settings;
CREATE POLICY "pin_settings_open_access" ON public.pin_settings FOR ALL TO public USING (true) WITH CHECK (true);

-- Insert default row
INSERT INTO public.pin_settings (id, admin_pin, readonly_pin, recovery_email)
VALUES ('global', '1895', '2075', 'valentinacabana48@gmail.com')
ON CONFLICT (id) DO NOTHING;

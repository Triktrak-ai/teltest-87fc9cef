
CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read app_settings" ON public.app_settings
  FOR SELECT USING (true);

INSERT INTO public.app_settings (key, value) VALUES ('download_block_disabled', 'false');

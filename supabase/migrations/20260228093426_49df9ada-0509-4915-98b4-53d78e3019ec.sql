
CREATE TABLE public.download_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  imei TEXT NOT NULL UNIQUE,
  last_success_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  attempts_today INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE download_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read download_schedule"
  ON download_schedule FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE download_schedule;

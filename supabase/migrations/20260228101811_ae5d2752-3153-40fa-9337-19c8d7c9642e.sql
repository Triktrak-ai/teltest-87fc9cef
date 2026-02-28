
-- Add log_uploaded column to sessions
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS log_uploaded boolean DEFAULT false;

-- Create storage bucket for session logs
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-logs', 'session-logs', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy: allow public read on session-logs bucket
CREATE POLICY "Allow public read session-logs"
ON storage.objects FOR SELECT
USING (bucket_id = 'session-logs');

-- RLS policy: allow service role insert (edge function uses service role key)
CREATE POLICY "Allow service role insert session-logs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'session-logs');

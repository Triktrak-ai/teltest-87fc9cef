
-- Create storage bucket for DDD files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ddd-files', 'ddd-files', false, 52428800, ARRAY['application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users can read DDD files
CREATE POLICY "Authenticated users can read ddd files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'ddd-files');

-- RLS: service role (edge functions) can insert DDD files
CREATE POLICY "Service can upload ddd files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ddd-files');

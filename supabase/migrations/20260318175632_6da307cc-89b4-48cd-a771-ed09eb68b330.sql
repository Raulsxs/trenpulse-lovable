INSERT INTO storage.buckets (id, name, public)
VALUES ('guides', 'guides', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read guides" ON storage.objects
FOR SELECT USING (bucket_id = 'guides');

CREATE POLICY "Auth upload guides" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'guides');
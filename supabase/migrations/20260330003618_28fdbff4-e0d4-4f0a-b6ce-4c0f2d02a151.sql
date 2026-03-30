
-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('content-images', 'content-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-images', 'generated-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('guides', 'guides', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies (use DO blocks to avoid duplicates)
DO $$ BEGIN CREATE POLICY "Public can view content images" ON storage.objects FOR SELECT USING (bucket_id = 'content-images'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth upload content-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'content-images'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth update content-images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'content-images' AND owner_id = auth.uid()::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth delete content-images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'content-images' AND owner_id = auth.uid()::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "Public view generated-images" ON storage.objects FOR SELECT USING (bucket_id = 'generated-images'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth upload generated-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'generated-images' AND auth.role() = 'authenticated'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth update generated-images" ON storage.objects FOR UPDATE USING (bucket_id = 'generated-images' AND owner_id = auth.uid()::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth delete generated-images" ON storage.objects FOR DELETE USING (bucket_id = 'generated-images' AND owner_id = auth.uid()::text); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY "Public read guides" ON storage.objects FOR SELECT USING (bucket_id = 'guides'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Auth upload guides" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'guides'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Realtime publications (ignore if already added)
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.image_generations; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_contents; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

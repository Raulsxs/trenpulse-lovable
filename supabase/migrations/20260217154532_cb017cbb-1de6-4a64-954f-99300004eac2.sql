-- Drop old permissive policies
DROP POLICY IF EXISTS "Users can update their images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their images" ON storage.objects;

-- Drop conflicting names if they exist
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

-- Create owner-scoped policies
CREATE POLICY "Users can update their own images" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'generated-images' AND owner_id = auth.uid()::text);

CREATE POLICY "Users can delete their own images" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'generated-images' AND owner_id = auth.uid()::text);
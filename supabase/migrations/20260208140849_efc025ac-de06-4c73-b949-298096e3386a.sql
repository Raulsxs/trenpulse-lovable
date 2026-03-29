-- Add RLS policies for content-images bucket
-- Allow authenticated users to upload images to content-images bucket
CREATE POLICY "Authenticated users can upload to content-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'content-images');

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update their own images in content-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'content-images' AND owner_id = auth.uid()::text);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own images in content-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'content-images' AND owner_id = auth.uid()::text);

-- Allow public read access since bucket is public
CREATE POLICY "Public read access for content-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'content-images');
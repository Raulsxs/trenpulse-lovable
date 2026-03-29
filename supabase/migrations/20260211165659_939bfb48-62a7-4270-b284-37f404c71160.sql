
-- Add type and subtype columns to brand_examples
-- type: format of the content (post, story, carousel)
-- subtype: role of the slide (cover, text_card, bullets, closing)
ALTER TABLE public.brand_examples 
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS subtype text;

-- Add style_guide versioning to brands
ALTER TABLE public.brands 
  ADD COLUMN IF NOT EXISTS style_guide_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS style_guide_updated_at timestamp with time zone;

-- Add UPDATE policy for brand_examples (currently missing)
CREATE POLICY "Users can update examples of their brands"
  ON public.brand_examples
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
  ));

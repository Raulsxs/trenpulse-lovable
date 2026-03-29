-- Add default_visual_style to brands table
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS default_visual_style text DEFAULT NULL;

-- Backfill existing brands based on creation_mode
UPDATE public.brands SET default_visual_style = 'photo_overlay' WHERE creation_mode = 'photo_backgrounds' AND default_visual_style IS NULL;
UPDATE public.brands SET default_visual_style = 'ai_background' WHERE creation_mode = 'style_copy' AND default_visual_style IS NULL;
UPDATE public.brands SET default_visual_style = 'ai_background' WHERE creation_mode = 'inspired' AND default_visual_style IS NULL;
-- from_scratch: leave NULL (user chooses each time)

-- Create user_photo_library table for persistent photo gallery
CREATE TABLE IF NOT EXISTS public.user_photo_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_photo_library ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own photos
CREATE POLICY "Users can manage own photos"
  ON public.user_photo_library
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_photo_library_user_id
  ON public.user_photo_library (user_id, created_at DESC);


-- Expand system_template_sets with reference/preview images and format support
ALTER TABLE public.system_template_sets
  ADD COLUMN IF NOT EXISTS reference_images jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_images jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supported_formats text[] DEFAULT '{post}'::text[],
  ADD COLUMN IF NOT EXISTS is_native boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS style_prompt text;

-- Add preferred_language to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'pt-BR';

-- Update existing system templates with supported_formats based on content_format
UPDATE public.system_template_sets
SET supported_formats = ARRAY[content_format]
WHERE supported_formats = '{post}' AND content_format != 'post';


-- Add visual_mode column to generated_contents
ALTER TABLE public.generated_contents 
ADD COLUMN IF NOT EXISTS visual_mode text NOT NULL DEFAULT 'brand_guided';

-- Add source_summary and key_insights for content provenance
ALTER TABLE public.generated_contents
ADD COLUMN IF NOT EXISTS source_summary text,
ADD COLUMN IF NOT EXISTS key_insights text[];


-- Add template_set_id, slide_count, include_cta to generated_contents
ALTER TABLE public.generated_contents
  ADD COLUMN IF NOT EXISTS template_set_id uuid REFERENCES public.brand_template_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slide_count integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS include_cta boolean DEFAULT true;

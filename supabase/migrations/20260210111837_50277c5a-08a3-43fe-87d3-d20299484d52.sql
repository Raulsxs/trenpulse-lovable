
-- Add brand_id and brand_snapshot to generated_contents
ALTER TABLE public.generated_contents
  ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN brand_snapshot jsonb DEFAULT NULL;

-- Add index for brand_id lookups
CREATE INDEX idx_generated_contents_brand_id ON public.generated_contents(brand_id);

-- Comment for documentation
COMMENT ON COLUMN public.generated_contents.brand_snapshot IS 'Snapshot of brand tokens at generation time: {name, palette, fonts, visual_tone, do_rules, dont_rules, logo_url, image_style}';

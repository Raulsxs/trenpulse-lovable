
-- Add render_mode feature flag to brands table
-- "LEGACY_FULL_IMAGE" = current behavior (default)
-- "AI_BG_OVERLAY" = new mode: AI generates background only, text is overlaid by app
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS render_mode text NOT NULL DEFAULT 'LEGACY_FULL_IMAGE';

-- Add comment for documentation
COMMENT ON COLUMN public.brands.render_mode IS 'Controls image generation mode: LEGACY_FULL_IMAGE (AI renders text in image) or AI_BG_OVERLAY (AI generates background only, text overlaid by app)';

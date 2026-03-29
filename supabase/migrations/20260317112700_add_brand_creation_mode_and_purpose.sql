-- Add creation_mode to brands (style_copy = existing behavior)
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS creation_mode text NOT NULL DEFAULT 'style_copy';

-- Add purpose to brand_examples (reference = style analysis, background = user photos as bg)
ALTER TABLE public.brand_examples
ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'reference';

-- Index for fast background photo lookup during generation
CREATE INDEX IF NOT EXISTS idx_brand_examples_purpose
ON public.brand_examples (brand_id, purpose) WHERE purpose = 'background';

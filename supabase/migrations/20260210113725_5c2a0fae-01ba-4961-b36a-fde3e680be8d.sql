-- Add style_guide column to brands table
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS style_guide jsonb DEFAULT NULL;

COMMENT ON COLUMN public.brands.style_guide IS 'AI-analyzed style guide from brand examples: templates, layout rules, palette confirmation';
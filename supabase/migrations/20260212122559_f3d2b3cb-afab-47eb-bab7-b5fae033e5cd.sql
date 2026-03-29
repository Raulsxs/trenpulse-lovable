
-- Add visual_signature, category_id, category_name to brand_template_sets
ALTER TABLE public.brand_template_sets
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.brand_example_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS visual_signature jsonb;

-- Unique index: one active set per category per brand
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_template_sets_brand_category_active
  ON public.brand_template_sets (brand_id, category_id)
  WHERE status = 'active' AND category_id IS NOT NULL;

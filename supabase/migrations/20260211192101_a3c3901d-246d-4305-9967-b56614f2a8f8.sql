
-- A1) Table brand_example_categories
CREATE TABLE public.brand_example_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_brand_example_categories_unique_name ON public.brand_example_categories (brand_id, lower(name));
CREATE INDEX idx_brand_example_categories_brand ON public.brand_example_categories (brand_id, created_at DESC);

ALTER TABLE public.brand_example_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view categories of their brands"
  ON public.brand_example_categories FOR SELECT
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can create categories for their brands"
  ON public.brand_example_categories FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can update categories of their brands"
  ON public.brand_example_categories FOR UPDATE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can delete categories of their brands"
  ON public.brand_example_categories FOR DELETE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_brand_example_categories_updated_at
  BEFORE UPDATE ON public.brand_example_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- A2) Alter brand_examples
ALTER TABLE public.brand_examples
  ADD COLUMN category_id uuid REFERENCES public.brand_example_categories(id) ON DELETE SET NULL,
  ADD COLUMN category_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN carousel_group_id uuid,
  ADD COLUMN slide_index integer,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX idx_brand_examples_category ON public.brand_examples (brand_id, category_id);
CREATE INDEX idx_brand_examples_carousel ON public.brand_examples (brand_id, carousel_group_id);
CREATE INDEX idx_brand_examples_type ON public.brand_examples (brand_id, type, subtype);

CREATE TRIGGER update_brand_examples_updated_at
  BEFORE UPDATE ON public.brand_examples
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- A3) Alter brands (dirty tracking)
ALTER TABLE public.brands
  ADD COLUMN template_sets_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN template_sets_dirty boolean NOT NULL DEFAULT false,
  ADD COLUMN template_sets_dirty_count integer NOT NULL DEFAULT 0,
  ADD COLUMN template_sets_updated_at timestamptz,
  ADD COLUMN template_sets_last_error text;

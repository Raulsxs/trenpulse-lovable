
-- brand_examples
CREATE TABLE IF NOT EXISTS public.brand_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumb_url TEXT,
  description TEXT,
  content_type TEXT DEFAULT 'geral',
  type text NOT NULL DEFAULT 'post',
  subtype text,
  category_id uuid,
  category_mode text NOT NULL DEFAULT 'auto',
  carousel_group_id uuid,
  slide_index integer,
  purpose text NOT NULL DEFAULT 'reference',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_examples ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_brand_examples_brand_id ON public.brand_examples(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_examples_purpose ON public.brand_examples (brand_id, purpose) WHERE purpose = 'background';
DO $$ BEGIN CREATE POLICY "be_sel" ON public.brand_examples FOR SELECT USING (public.is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "be_ins" ON public.brand_examples FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "be_upd" ON public.brand_examples FOR UPDATE USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "be_del" ON public.brand_examples FOR DELETE USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_brand_examples_updated_at ON public.brand_examples;
CREATE TRIGGER update_brand_examples_updated_at BEFORE UPDATE ON public.brand_examples FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- brand_example_categories
CREATE TABLE IF NOT EXISTS public.brand_example_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL, description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_example_categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "bec_sel" ON public.brand_example_categories FOR SELECT USING (public.is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bec_ins" ON public.brand_example_categories FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bec_upd" ON public.brand_example_categories FOR UPDATE USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bec_del" ON public.brand_example_categories FOR DELETE USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_example_categories.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_brand_example_categories_updated_at ON public.brand_example_categories;
CREATE TRIGGER update_brand_example_categories_updated_at BEFORE UPDATE ON public.brand_example_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- brand_template_sets
CREATE TABLE IF NOT EXISTS public.brand_template_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source_example_ids JSONB DEFAULT '[]'::jsonb,
  template_set JSONB NOT NULL DEFAULT '{}'::jsonb,
  category_id uuid,
  category_name text,
  visual_signature jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_template_sets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_brand_template_sets_brand_id ON public.brand_template_sets(brand_id);
DO $$ BEGIN CREATE POLICY "bts_sel" ON public.brand_template_sets FOR SELECT USING (public.is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bts_ins" ON public.brand_template_sets FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bts_upd" ON public.brand_template_sets FOR UPDATE USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bts_del" ON public.brand_template_sets FOR DELETE USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_brand_template_sets_updated_at ON public.brand_template_sets;
CREATE TRIGGER update_brand_template_sets_updated_at BEFORE UPDATE ON public.brand_template_sets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- brand_background_templates
CREATE TABLE IF NOT EXISTS public.brand_background_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL, description text,
  content_format text NOT NULL DEFAULT 'post',
  slide_count integer NOT NULL DEFAULT 1,
  background_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_content_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_background_templates ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "bbt_sel" ON public.brand_background_templates FOR SELECT USING (is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bbt_ins" ON public.brand_background_templates FOR INSERT TO authenticated WITH CHECK (is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bbt_upd" ON public.brand_background_templates FOR UPDATE TO authenticated USING (is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "bbt_del" ON public.brand_background_templates FOR DELETE TO authenticated USING (is_brand_visible_to_user(brand_id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_brand_background_templates_updated_at ON public.brand_background_templates;
CREATE TRIGGER update_brand_background_templates_updated_at BEFORE UPDATE ON public.brand_background_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

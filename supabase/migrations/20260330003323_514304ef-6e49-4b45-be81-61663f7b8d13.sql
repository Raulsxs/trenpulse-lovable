
-- Step 1: brands table (no external FK deps)
CREATE TABLE IF NOT EXISTS public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  palette JSONB DEFAULT '[]'::jsonb,
  fonts JSONB DEFAULT '{"headings": "Inter", "body": "Inter"}'::jsonb,
  logo_url TEXT,
  visual_tone TEXT DEFAULT 'clean',
  do_rules TEXT,
  dont_rules TEXT,
  style_guide jsonb DEFAULT NULL,
  style_guide_version integer NOT NULL DEFAULT 0,
  style_guide_updated_at timestamp with time zone,
  default_template_set_id UUID,
  template_sets_status text NOT NULL DEFAULT 'idle',
  template_sets_dirty boolean NOT NULL DEFAULT false,
  template_sets_dirty_count integer NOT NULL DEFAULT 0,
  template_sets_updated_at timestamptz,
  template_sets_last_error text,
  render_mode text NOT NULL DEFAULT 'LEGACY_FULL_IMAGE',
  visual_preferences jsonb DEFAULT NULL,
  creation_mode text NOT NULL DEFAULT 'style_copy',
  default_visual_style text DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_brands_owner ON public.brands(owner_user_id);
DO $$ BEGIN CREATE POLICY "Users can create their own brands" ON public.brands FOR INSERT WITH CHECK (auth.uid() = owner_user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own brands" ON public.brands FOR UPDATE USING (auth.uid() = owner_user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own brands" ON public.brands FOR DELETE USING (auth.uid() = owner_user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_brands_updated_at ON public.brands;
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

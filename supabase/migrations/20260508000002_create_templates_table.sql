-- Templates table — backbone of the template-first refactor.
-- Curated templates have owner_user_id NULL e is_personal=false.
-- Personal templates (Fase 4) ficam com owner_user_id setado e is_personal=true.

CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  format TEXT NOT NULL,
  aspect_ratios TEXT[] NOT NULL DEFAULT ARRAY['1:1'],
  preview_url TEXT NOT NULL,
  preview_video_url TEXT,
  engine TEXT NOT NULL,
  blotato_template_id TEXT,
  prompt_template TEXT,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_slots TEXT[],
  cost_credits INT NOT NULL DEFAULT 1,
  viral_views INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT templates_format_check
    CHECK (format IN ('post','story','linkedin','tweet','video','carousel')),
  CONSTRAINT templates_engine_check
    CHECK (engine IN ('blotato','gemini','satori')),
  CONSTRAINT templates_category_check
    CHECK (category IN ('infographic','slideshow','card','photo_quote','video','carousel')),
  CONSTRAINT templates_personal_owner_required
    CHECK (is_personal = false OR owner_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_templates_format
  ON public.templates(format) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_templates_owner
  ON public.templates(owner_user_id) WHERE is_personal;
CREATE INDEX IF NOT EXISTS idx_templates_category
  ON public.templates(category) WHERE is_active;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "templates_select_curated" ON public.templates
    FOR SELECT TO authenticated
    USING (is_personal = false AND is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_select_personal" ON public.templates
    FOR SELECT TO authenticated
    USING (is_personal = true AND owner_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_insert_personal" ON public.templates
    FOR INSERT TO authenticated
    WITH CHECK (is_personal = true AND owner_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_update_personal" ON public.templates
    FOR UPDATE TO authenticated
    USING (is_personal = true AND owner_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_delete_personal" ON public.templates
    FOR DELETE TO authenticated
    USING (is_personal = true AND owner_user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "templates_service_role_all" ON public.templates
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP TRIGGER IF EXISTS update_templates_updated_at ON public.templates;
CREATE TRIGGER update_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.templates IS
  'Catálogo de templates virais para o produto template-first. Curados (owner_user_id NULL) + pessoais (Fase 4).';

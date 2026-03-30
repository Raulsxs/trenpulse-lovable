
-- instagram_connections
CREATE TABLE IF NOT EXISTS public.instagram_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instagram_user_id text NOT NULL,
  instagram_username text,
  page_id text NOT NULL,
  page_name text,
  access_token text NOT NULL,
  token_expires_at timestamp with time zone,
  scopes text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, instagram_user_id)
);
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "ic_sel" ON public.instagram_connections FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ic_ins" ON public.instagram_connections FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ic_upd" ON public.instagram_connections FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ic_del" ON public.instagram_connections FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_instagram_connections_updated_at ON public.instagram_connections;
CREATE TRIGGER update_instagram_connections_updated_at BEFORE UPDATE ON public.instagram_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- linkedin_connections
CREATE TABLE IF NOT EXISTS public.linkedin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  linkedin_user_id text NOT NULL,
  linkedin_name text, linkedin_email text, linkedin_profile_url text,
  access_token text NOT NULL, refresh_token text,
  token_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  scopes text[] DEFAULT '{}'::text[],
  organization_id text, organization_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "lc_sel" ON public.linkedin_connections FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "lc_ins" ON public.linkedin_connections FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "lc_upd" ON public.linkedin_connections FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "lc_del" ON public.linkedin_connections FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_linkedin_connections_updated_at ON public.linkedin_connections;
CREATE TRIGGER update_linkedin_connections_updated_at BEFORE UPDATE ON public.linkedin_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- system_template_sets
CREATE TABLE IF NOT EXISTS public.system_template_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL, description text,
  category text NOT NULL DEFAULT 'geral',
  content_format text NOT NULL DEFAULT 'post',
  template_set jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_colors jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  reference_images jsonb DEFAULT '{}'::jsonb,
  preview_images jsonb DEFAULT '{}'::jsonb,
  supported_formats text[] DEFAULT '{post}'::text[],
  is_native boolean NOT NULL DEFAULT true,
  style_prompt text,
  supported_platforms text[] DEFAULT '{instagram}'::text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.system_template_sets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "sts_sel" ON public.system_template_sets FOR SELECT USING (is_active = true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- favorite_template_sets
CREATE TABLE IF NOT EXISTS public.favorite_template_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  template_set_type text NOT NULL CHECK (template_set_type IN ('system', 'brand')),
  template_set_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_set_type, template_set_id)
);
ALTER TABLE public.favorite_template_sets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "fts_sel" ON public.favorite_template_sets FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "fts_ins" ON public.favorite_template_sets FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "fts_del" ON public.favorite_template_sets FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- visual_briefs
CREATE TABLE IF NOT EXISTS public.visual_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  theme TEXT, key_message TEXT, emotion TEXT, visual_metaphor TEXT, style TEXT,
  palette JSONB DEFAULT '[]'::jsonb, negative_elements TEXT,
  text_on_image BOOLEAN DEFAULT true, text_limit_words INT DEFAULT 10,
  composition_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(slide_id)
);
ALTER TABLE public.visual_briefs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "vb_sel" ON public.visual_briefs FOR SELECT USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "vb_ins" ON public.visual_briefs FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "vb_upd" ON public.visual_briefs FOR UPDATE USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- image_prompts
CREATE TABLE IF NOT EXISTS public.image_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  brief_id UUID REFERENCES public.visual_briefs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL, negative_prompt TEXT,
  model_hint TEXT DEFAULT 'cheap', variant_index INT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.image_prompts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "ip_sel" ON public.image_prompts FOR SELECT USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = image_prompts.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ip_ins" ON public.image_prompts FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = image_prompts.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- image_generations
CREATE TABLE IF NOT EXISTS public.image_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.image_prompts(id) ON DELETE CASCADE,
  model_used TEXT, image_url TEXT, thumb_url TEXT,
  width INT DEFAULT 1080, height INT DEFAULT 1080,
  seed TEXT, ranking_score NUMERIC, ranking_reason TEXT,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "ig_sel" ON public.image_generations FOR SELECT USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ig_ins" ON public.image_generations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ig_upd" ON public.image_generations FOR UPDATE USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ig_del" ON public.image_generations FOR DELETE USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

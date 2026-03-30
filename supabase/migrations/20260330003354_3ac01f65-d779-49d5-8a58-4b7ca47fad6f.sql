
-- brand_shares + function + brand SELECT policy
CREATE TABLE IF NOT EXISTS public.brand_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL,
  permission text NOT NULL DEFAULT 'read',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, shared_with_user_id)
);
ALTER TABLE public.brand_shares ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Brand owners can manage shares" ON public.brand_shares FOR ALL USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_shares.brand_id AND b.owner_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_shares.brand_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Shared users can view their shares" ON public.brand_shares FOR SELECT USING (shared_with_user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.is_brand_visible_to_user(_brand_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.brands WHERE id = _brand_id AND owner_user_id = _user_id)
  OR EXISTS (SELECT 1 FROM public.brand_shares WHERE brand_id = _brand_id AND shared_with_user_id = _user_id)
$$;

DROP POLICY IF EXISTS "Users can view their own brands" ON public.brands;
DROP POLICY IF EXISTS "Users can view their own or shared brands" ON public.brands;
DO $$ BEGIN CREATE POLICY "Users can view their own or shared brands" ON public.brands FOR SELECT USING (public.is_brand_visible_to_user(id, auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- projects -> posts -> slides chain
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_projects_brand ON public.projects(brand_id);
DO $$ BEGIN CREATE POLICY "prj_sel" ON public.projects FOR SELECT USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "prj_ins" ON public.projects FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "prj_upd" ON public.projects FOR UPDATE USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "prj_del" ON public.projects FOR DELETE USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  raw_post_text TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'educativo',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_posts_project ON public.posts(project_id);
DO $$ BEGIN CREATE POLICY "pst_sel" ON public.posts FOR SELECT USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.brands b ON b.id = p.brand_id WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pst_ins" ON public.posts FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.projects p JOIN public.brands b ON b.id = p.brand_id WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pst_upd" ON public.posts FOR UPDATE USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.brands b ON b.id = p.brand_id WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "pst_del" ON public.posts FOR DELETE USING (EXISTS (SELECT 1 FROM public.projects p JOIN public.brands b ON b.id = p.brand_id WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  slide_index INT NOT NULL,
  slide_text TEXT,
  layout_preset TEXT DEFAULT 'default',
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, slide_index)
);
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_slides_post ON public.slides(post_id);
DO $$ BEGIN CREATE POLICY "sld_sel" ON public.slides FOR SELECT USING (EXISTS (SELECT 1 FROM public.posts po JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sld_ins" ON public.slides FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.posts po JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sld_upd" ON public.slides FOR UPDATE USING (EXISTS (SELECT 1 FROM public.posts po JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "sld_del" ON public.slides FOR DELETE USING (EXISTS (SELECT 1 FROM public.posts po JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_slides_updated_at ON public.slides;
CREATE TRIGGER update_slides_updated_at BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

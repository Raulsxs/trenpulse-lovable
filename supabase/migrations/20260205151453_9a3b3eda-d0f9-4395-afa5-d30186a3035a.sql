-- =============================================
-- VISUAL CONTENT GENERATION PIPELINE - SCHEMA
-- =============================================

-- 1. BRANDS TABLE
CREATE TABLE public.brands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  palette JSONB DEFAULT '[]'::jsonb,
  fonts JSONB DEFAULT '{"headings": "Inter", "body": "Inter"}'::jsonb,
  logo_url TEXT,
  visual_tone TEXT DEFAULT 'clean',
  do_rules TEXT,
  dont_rules TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. PROJECTS TABLE
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. POSTS TABLE
CREATE TABLE public.posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  raw_post_text TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'educativo',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_content_type CHECK (content_type IN ('noticia', 'educativo', 'frase', 'curiosidade', 'tutorial', 'anuncio'))
);

-- 4. SLIDES TABLE
CREATE TABLE public.slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  slide_index INT NOT NULL,
  slide_text TEXT,
  layout_preset TEXT DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(post_id, slide_index)
);

-- 5. VISUAL BRIEFS TABLE
CREATE TABLE public.visual_briefs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  theme TEXT,
  key_message TEXT,
  emotion TEXT,
  visual_metaphor TEXT,
  style TEXT,
  palette JSONB DEFAULT '[]'::jsonb,
  negative_elements TEXT,
  text_on_image BOOLEAN DEFAULT true,
  text_limit_words INT DEFAULT 10,
  composition_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(slide_id)
);

-- 6. IMAGE PROMPTS TABLE
CREATE TABLE public.image_prompts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  brief_id UUID REFERENCES public.visual_briefs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model_hint TEXT DEFAULT 'cheap',
  variant_index INT DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 7. IMAGE GENERATIONS TABLE
CREATE TABLE public.image_generations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.image_prompts(id) ON DELETE CASCADE,
  model_used TEXT,
  image_url TEXT,
  thumb_url TEXT,
  width INT DEFAULT 1080,
  height INT DEFAULT 1080,
  seed TEXT,
  ranking_score NUMERIC,
  ranking_reason TEXT,
  is_selected BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. SLIDE VERSIONS TABLE
CREATE TABLE public.slide_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  version INT NOT NULL,
  slide_text TEXT,
  layout_preset TEXT,
  selected_image_generation_id UUID REFERENCES public.image_generations(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(slide_id, version)
);

-- 9. QUALITY FEEDBACK TABLE
CREATE TABLE public.quality_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_generation_id UUID NOT NULL REFERENCES public.image_generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote TEXT NOT NULL,
  reasons JSONB DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_vote CHECK (vote IN ('up', 'down'))
);

-- 10. QUALITY METRICS TABLE
CREATE TABLE public.quality_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  adherence INT CHECK (adherence >= 0 AND adherence <= 5),
  legibility INT CHECK (legibility >= 0 AND legibility <= 5),
  brand_consistency INT CHECK (brand_consistency >= 0 AND brand_consistency <= 5),
  premium_look INT CHECK (premium_look >= 0 AND premium_look <= 5),
  publish_ready BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_brands_owner ON public.brands(owner_user_id);
CREATE INDEX idx_projects_brand ON public.projects(brand_id);
CREATE INDEX idx_posts_project ON public.posts(project_id);
CREATE INDEX idx_posts_created ON public.posts(created_at DESC);
CREATE INDEX idx_slides_post ON public.slides(post_id);
CREATE INDEX idx_slides_index ON public.slides(post_id, slide_index);
CREATE INDEX idx_visual_briefs_slide ON public.visual_briefs(slide_id);
CREATE INDEX idx_image_prompts_slide ON public.image_prompts(slide_id);
CREATE INDEX idx_image_generations_slide ON public.image_generations(slide_id);
CREATE INDEX idx_image_generations_selected ON public.image_generations(slide_id, is_selected);
CREATE INDEX idx_image_generations_created ON public.image_generations(created_at DESC);
CREATE INDEX idx_slide_versions_slide ON public.slide_versions(slide_id);
CREATE INDEX idx_quality_feedback_image ON public.quality_feedback(image_generation_id);
CREATE INDEX idx_quality_metrics_slide ON public.quality_metrics(slide_id);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================

-- Enable RLS on all tables
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visual_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slide_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_metrics ENABLE ROW LEVEL SECURITY;

-- BRANDS policies
CREATE POLICY "Users can view their own brands" ON public.brands FOR SELECT USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can create their own brands" ON public.brands FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update their own brands" ON public.brands FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete their own brands" ON public.brands FOR DELETE USING (auth.uid() = owner_user_id);

-- PROJECTS policies (through brand ownership)
CREATE POLICY "Users can view projects of their brands" ON public.projects FOR SELECT 
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid()));
CREATE POLICY "Users can create projects for their brands" ON public.projects FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid()));
CREATE POLICY "Users can update projects of their brands" ON public.projects FOR UPDATE 
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid()));
CREATE POLICY "Users can delete projects of their brands" ON public.projects FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.brands WHERE brands.id = projects.brand_id AND brands.owner_user_id = auth.uid()));

-- POSTS policies (through project -> brand)
CREATE POLICY "Users can view posts of their projects" ON public.posts FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.projects p 
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create posts for their projects" ON public.posts FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects p 
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can update posts of their projects" ON public.posts FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.projects p 
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can delete posts of their projects" ON public.posts FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.projects p 
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE p.id = posts.project_id AND b.owner_user_id = auth.uid()
  ));

-- SLIDES policies (through post -> project -> brand)
CREATE POLICY "Users can view slides of their posts" ON public.slides FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.posts po
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create slides for their posts" ON public.slides FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.posts po
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can update slides of their posts" ON public.slides FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.posts po
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can delete slides of their posts" ON public.slides FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.posts po
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE po.id = slides.post_id AND b.owner_user_id = auth.uid()
  ));

-- VISUAL BRIEFS policies (through slide -> post -> project -> brand)
CREATE POLICY "Users can view briefs of their slides" ON public.visual_briefs FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create briefs for their slides" ON public.visual_briefs FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can update briefs of their slides" ON public.visual_briefs FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can delete briefs of their slides" ON public.visual_briefs FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = visual_briefs.slide_id AND b.owner_user_id = auth.uid()
  ));

-- IMAGE PROMPTS policies
CREATE POLICY "Users can view prompts of their slides" ON public.image_prompts FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_prompts.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create prompts for their slides" ON public.image_prompts FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_prompts.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can update prompts of their slides" ON public.image_prompts FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_prompts.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can delete prompts of their slides" ON public.image_prompts FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_prompts.slide_id AND b.owner_user_id = auth.uid()
  ));

-- IMAGE GENERATIONS policies
CREATE POLICY "Users can view generations of their slides" ON public.image_generations FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create generations for their slides" ON public.image_generations FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can update generations of their slides" ON public.image_generations FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can delete generations of their slides" ON public.image_generations FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = image_generations.slide_id AND b.owner_user_id = auth.uid()
  ));

-- SLIDE VERSIONS policies
CREATE POLICY "Users can view versions of their slides" ON public.slide_versions FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = slide_versions.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create versions for their slides" ON public.slide_versions FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = slide_versions.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can update versions of their slides" ON public.slide_versions FOR UPDATE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = slide_versions.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can delete versions of their slides" ON public.slide_versions FOR DELETE 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = slide_versions.slide_id AND b.owner_user_id = auth.uid()
  ));

-- QUALITY FEEDBACK policies
CREATE POLICY "Users can view their own feedback" ON public.quality_feedback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create feedback" ON public.quality_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own feedback" ON public.quality_feedback FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own feedback" ON public.quality_feedback FOR DELETE USING (auth.uid() = user_id);

-- QUALITY METRICS policies
CREATE POLICY "Users can view metrics of their slides" ON public.quality_metrics FOR SELECT 
  USING (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = quality_metrics.slide_id AND b.owner_user_id = auth.uid()
  ));
CREATE POLICY "Users can create metrics for their slides" ON public.quality_metrics FOR INSERT 
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.slides s
    JOIN public.posts po ON po.id = s.post_id
    JOIN public.projects p ON p.id = po.project_id
    JOIN public.brands b ON b.id = p.brand_id 
    WHERE s.id = quality_metrics.slide_id AND b.owner_user_id = auth.uid()
  ));

-- =============================================
-- TRIGGERS FOR UPDATED_AT
-- =============================================
CREATE TRIGGER update_brands_updated_at BEFORE UPDATE ON public.brands FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_slides_updated_at BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_visual_briefs_updated_at BEFORE UPDATE ON public.visual_briefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- STORAGE BUCKET FOR GENERATED IMAGES
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('generated-images', 'generated-images', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can view generated images" ON storage.objects FOR SELECT USING (bucket_id = 'generated-images');
CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'generated-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update their images" ON storage.objects FOR UPDATE USING (bucket_id = 'generated-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can delete their images" ON storage.objects FOR DELETE USING (bucket_id = 'generated-images' AND auth.role() = 'authenticated');
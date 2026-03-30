-- ============================================
-- Migration: 20260120135321_3d92ab4d-73c5-4a7b-833e-34a7bd88b8ff.sql
-- ============================================
-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  company_name TEXT,
  instagram_handle TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trends table for scraped/curated trends
CREATE TABLE public.trends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  theme TEXT NOT NULL,
  relevance_score INTEGER DEFAULT 50 CHECK (relevance_score >= 0 AND relevance_score <= 100),
  keywords TEXT[],
  is_active BOOLEAN DEFAULT true,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on trends (public read, admin write)
ALTER TABLE public.trends ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read trends
CREATE POLICY "Authenticated users can view trends" 
ON public.trends FOR SELECT 
TO authenticated
USING (is_active = true);

-- Create generated_contents table
CREATE TABLE public.generated_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trend_id UUID REFERENCES public.trends(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'story', 'carousel')),
  title TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT[],
  slides JSONB DEFAULT '[]'::jsonb,
  image_urls TEXT[],
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'downloaded', 'published')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on generated_contents
ALTER TABLE public.generated_contents ENABLE ROW LEVEL SECURITY;

-- Users can only access their own content
CREATE POLICY "Users can view their own content" 
ON public.generated_contents FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own content" 
ON public.generated_contents FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own content" 
ON public.generated_contents FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own content" 
ON public.generated_contents FOR DELETE 
USING (auth.uid() = user_id);

-- Create saved_trends table for user bookmarks
CREATE TABLE public.saved_trends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trend_id UUID NOT NULL REFERENCES public.trends(id) ON DELETE CASCADE,
  saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, trend_id)
);

-- Enable RLS on saved_trends
ALTER TABLE public.saved_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their saved trends" 
ON public.saved_trends FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can save trends" 
ON public.saved_trends FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unsave trends" 
ON public.saved_trends FOR DELETE 
USING (auth.uid() = user_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_generated_contents_updated_at
BEFORE UPDATE ON public.generated_contents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Migration: 20260120175148_00a2494e-3c94-47cb-9f4d-0a482e252f49.sql
-- ============================================
-- Enable required extensions for cron jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- Migration: 20260121165221_e7f01015-c14b-4194-8c32-ef004de6ed23.sql
-- ============================================
-- Create storage bucket for user uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-images', 'content-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for the bucket
CREATE POLICY "Users can upload their own images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'content-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'content-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their own images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'content-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'content-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Public access for viewing (since bucket is public)
CREATE POLICY "Public can view content images"
ON storage.objects FOR SELECT
USING (bucket_id = 'content-images');

-- Add scheduled_at column to generated_contents for scheduling feature
ALTER TABLE public.generated_contents 
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- ============================================
-- Migration: 20260205151453_9a3b3eda-d0f9-4395-afa5-d30186a3035a.sql
-- ============================================
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

-- ============================================
-- Migration: 20260206170906_b5602765-9ed8-4ebd-aee6-174b7cc339f9.sql
-- ============================================
-- Create brand_examples table for reference content
CREATE TABLE public.brand_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumb_url TEXT,
  description TEXT,
  content_type TEXT DEFAULT 'geral',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_examples ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view examples of their brands"
ON public.brand_examples FOR SELECT
USING (EXISTS (
  SELECT 1 FROM brands b
  WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
));

CREATE POLICY "Users can create examples for their brands"
ON public.brand_examples FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM brands b
  WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
));

CREATE POLICY "Users can delete examples of their brands"
ON public.brand_examples FOR DELETE
USING (EXISTS (
  SELECT 1 FROM brands b
  WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
));

-- Index for fast lookups
CREATE INDEX idx_brand_examples_brand_id ON public.brand_examples(brand_id);

-- ============================================
-- Migration: 20260208140849_efc025ac-de06-4c73-b949-298096e3386a.sql
-- ============================================
-- Add RLS policies for content-images bucket
-- Allow authenticated users to upload images to content-images bucket
CREATE POLICY "Authenticated users can upload to content-images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'content-images');

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update their own images in content-images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'content-images' AND owner_id = auth.uid()::text);

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own images in content-images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'content-images' AND owner_id = auth.uid()::text);

-- Allow public read access since bucket is public
CREATE POLICY "Public read access for content-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'content-images');

-- ============================================
-- Migration: 20260210111837_50277c5a-08a3-43fe-87d3-d20299484d52.sql
-- ============================================

-- Add brand_id and brand_snapshot to generated_contents
ALTER TABLE public.generated_contents
  ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN brand_snapshot jsonb DEFAULT NULL;

-- Add index for brand_id lookups
CREATE INDEX idx_generated_contents_brand_id ON public.generated_contents(brand_id);

-- Comment for documentation
COMMENT ON COLUMN public.generated_contents.brand_snapshot IS 'Snapshot of brand tokens at generation time: {name, palette, fonts, visual_tone, do_rules, dont_rules, logo_url, image_style}';


-- ============================================
-- Migration: 20260210113725_5c2a0fae-01ba-4961-b36a-fde3e680be8d.sql
-- ============================================
-- Add style_guide column to brands table
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS style_guide jsonb DEFAULT NULL;

COMMENT ON COLUMN public.brands.style_guide IS 'AI-analyzed style guide from brand examples: templates, layout rules, palette confirmation';

-- ============================================
-- Migration: 20260210115624_90a56c97-fa34-425d-a51c-f4f33f8f8293.sql
-- ============================================

-- Add visual_mode column to generated_contents
ALTER TABLE public.generated_contents 
ADD COLUMN IF NOT EXISTS visual_mode text NOT NULL DEFAULT 'brand_guided';

-- Add source_summary and key_insights for content provenance
ALTER TABLE public.generated_contents
ADD COLUMN IF NOT EXISTS source_summary text,
ADD COLUMN IF NOT EXISTS key_insights text[];


-- ============================================
-- Migration: 20260211165659_939bfb48-62a7-4270-b284-37f404c71160.sql
-- ============================================

-- Add type and subtype columns to brand_examples
-- type: format of the content (post, story, carousel)
-- subtype: role of the slide (cover, text_card, bullets, closing)
ALTER TABLE public.brand_examples 
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'post',
  ADD COLUMN IF NOT EXISTS subtype text;

-- Add style_guide versioning to brands
ALTER TABLE public.brands 
  ADD COLUMN IF NOT EXISTS style_guide_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS style_guide_updated_at timestamp with time zone;

-- Add UPDATE policy for brand_examples (currently missing)
CREATE POLICY "Users can update examples of their brands"
  ON public.brand_examples
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
  ));


-- ============================================
-- Migration: 20260211175440_bc94f21e-0e4b-4200-a963-0ee503f7eeb3.sql
-- ============================================

-- Create brand_template_sets table
CREATE TABLE public.brand_template_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source_example_ids JSONB DEFAULT '[]'::jsonb,
  template_set JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add default_template_set_id to brands
ALTER TABLE public.brands ADD COLUMN default_template_set_id UUID REFERENCES public.brand_template_sets(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.brand_template_sets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view template sets of their brands"
  ON public.brand_template_sets FOR SELECT
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can create template sets for their brands"
  ON public.brand_template_sets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can update template sets of their brands"
  ON public.brand_template_sets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can delete template sets of their brands"
  ON public.brand_template_sets FOR DELETE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

-- Index
CREATE INDEX idx_brand_template_sets_brand_id ON public.brand_template_sets(brand_id);

-- Trigger for updated_at
CREATE TRIGGER update_brand_template_sets_updated_at
  BEFORE UPDATE ON public.brand_template_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- Migration: 20260211192101_a3c3901d-246d-4305-9967-b56614f2a8f8.sql
-- ============================================

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


-- ============================================
-- Migration: 20260211195109_04f26995-38c5-46b8-8381-518343b12c5d.sql
-- ============================================

-- Add template_set_id, slide_count, include_cta to generated_contents
ALTER TABLE public.generated_contents
  ADD COLUMN IF NOT EXISTS template_set_id uuid REFERENCES public.brand_template_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS slide_count integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS include_cta boolean DEFAULT true;


-- ============================================
-- Migration: 20260212122559_f3d2b3cb-afab-47eb-bab7-b5fae033e5cd.sql
-- ============================================

-- Add visual_signature, category_id, category_name to brand_template_sets
ALTER TABLE public.brand_template_sets
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.brand_example_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_name text,
  ADD COLUMN IF NOT EXISTS visual_signature jsonb;

-- Unique index: one active set per category per brand
CREATE UNIQUE INDEX IF NOT EXISTS idx_brand_template_sets_brand_category_active
  ON public.brand_template_sets (brand_id, category_id)
  WHERE status = 'active' AND category_id IS NOT NULL;


-- ============================================
-- Migration: 20260215183316_32edd5fa-d1c9-43ef-8666-907fb5f7b116.sql
-- ============================================

-- Add published_at column to generated_contents
ALTER TABLE public.generated_contents 
ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

-- Create indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_generated_contents_user_scheduled 
ON public.generated_contents (user_id, scheduled_at) 
WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generated_contents_user_status 
ON public.generated_contents (user_id, status);


-- ============================================
-- Migration: 20260217154532_cb017cbb-1de6-4a64-954f-99300004eac2.sql
-- ============================================
-- Drop old permissive policies
DROP POLICY IF EXISTS "Users can update their images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their images" ON storage.objects;

-- Drop conflicting names if they exist
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

-- Create owner-scoped policies
CREATE POLICY "Users can update their own images" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'generated-images' AND owner_id = auth.uid()::text);

CREATE POLICY "Users can delete their own images" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'generated-images' AND owner_id = auth.uid()::text);

-- ============================================
-- Migration: 20260217164627_942e93fb-2010-43fa-b785-ec785f3a719e.sql
-- ============================================

-- Create brand sharing table
CREATE TABLE public.brand_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL,
  permission text NOT NULL DEFAULT 'read',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, shared_with_user_id)
);

ALTER TABLE public.brand_shares ENABLE ROW LEVEL SECURITY;

-- Owner can manage shares
CREATE POLICY "Brand owners can manage shares"
  ON public.brand_shares FOR ALL
  USING (EXISTS (
    SELECT 1 FROM brands b WHERE b.id = brand_shares.brand_id AND b.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM brands b WHERE b.id = brand_shares.brand_id AND b.owner_user_id = auth.uid()
  ));

-- Shared users can see their shares
CREATE POLICY "Shared users can view their shares"
  ON public.brand_shares FOR SELECT
  USING (shared_with_user_id = auth.uid());

-- Update brands SELECT policy to include shared users
DROP POLICY IF EXISTS "Users can view their own brands" ON public.brands;
CREATE POLICY "Users can view their own or shared brands"
  ON public.brands FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM public.brand_shares bs
      WHERE bs.brand_id = brands.id AND bs.shared_with_user_id = auth.uid()
    )
  );

-- Update brand_examples SELECT policy
DROP POLICY IF EXISTS "Users can view examples of their brands" ON public.brand_examples;
CREATE POLICY "Users can view examples of their own or shared brands"
  ON public.brand_examples FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_examples.brand_id
    AND (
      b.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.brand_shares bs WHERE bs.brand_id = b.id AND bs.shared_with_user_id = auth.uid())
    )
  ));

-- Update brand_template_sets SELECT policy
DROP POLICY IF EXISTS "Users can view template sets of their brands" ON public.brand_template_sets;
CREATE POLICY "Users can view template sets of their own or shared brands"
  ON public.brand_template_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_template_sets.brand_id
    AND (
      b.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.brand_shares bs WHERE bs.brand_id = b.id AND bs.shared_with_user_id = auth.uid())
    )
  ));

-- Update brand_example_categories SELECT policy
DROP POLICY IF EXISTS "Users can view categories of their brands" ON public.brand_example_categories;
CREATE POLICY "Users can view categories of their own or shared brands"
  ON public.brand_example_categories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_example_categories.brand_id
    AND (
      b.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.brand_shares bs WHERE bs.brand_id = b.id AND bs.shared_with_user_id = auth.uid())
    )
  ));

-- Insert the share: raul's brands shared with maikon
INSERT INTO public.brand_shares (brand_id, shared_with_user_id, permission)
SELECT id, '58a0c7ec-faf7-4b70-91cd-ce335100f66f', 'read'
FROM public.brands
WHERE owner_user_id = '1294d060-6783-4f7a-9df4-3c5f567eded4';


-- ============================================
-- Migration: 20260217165000_53770ff7-a302-41a7-a3fe-0f8d3ce04aa2.sql
-- ============================================

-- Create a security definer function to check brand sharing without recursion
CREATE OR REPLACE FUNCTION public.is_brand_visible_to_user(_brand_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brands WHERE id = _brand_id AND owner_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.brand_shares WHERE brand_id = _brand_id AND shared_with_user_id = _user_id
  )
$$;

-- Fix brands SELECT policy
DROP POLICY IF EXISTS "Users can view their own or shared brands" ON public.brands;
DROP POLICY IF EXISTS "Users can view their own brands" ON public.brands;
CREATE POLICY "Users can view their own or shared brands"
  ON public.brands FOR SELECT
  USING (public.is_brand_visible_to_user(id, auth.uid()));

-- Fix brand_examples SELECT policy
DROP POLICY IF EXISTS "Users can view examples of their own or shared brands" ON public.brand_examples;
DROP POLICY IF EXISTS "Users can view examples of their brands" ON public.brand_examples;
CREATE POLICY "Users can view examples of their own or shared brands"
  ON public.brand_examples FOR SELECT
  USING (public.is_brand_visible_to_user(brand_id, auth.uid()));

-- Fix brand_template_sets SELECT policy
DROP POLICY IF EXISTS "Users can view template sets of their own or shared brands" ON public.brand_template_sets;
DROP POLICY IF EXISTS "Users can view template sets of their brands" ON public.brand_template_sets;
CREATE POLICY "Users can view template sets of their own or shared brands"
  ON public.brand_template_sets FOR SELECT
  USING (public.is_brand_visible_to_user(brand_id, auth.uid()));

-- Fix brand_example_categories SELECT policy
DROP POLICY IF EXISTS "Users can view categories of their own or shared brands" ON public.brand_example_categories;
DROP POLICY IF EXISTS "Users can view categories of their brands" ON public.brand_example_categories;
CREATE POLICY "Users can view categories of their own or shared brands"
  ON public.brand_example_categories FOR SELECT
  USING (public.is_brand_visible_to_user(brand_id, auth.uid()));


-- ============================================
-- Migration: 20260217223713_fef2b8d8-0f5a-4668-83b7-6abbaa9d06a2.sql
-- ============================================

-- Add V2 profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS native_language text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS secondary_languages text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_tone text NOT NULL DEFAULT 'profissional',
  ADD COLUMN IF NOT EXISTS preferred_audience text NOT NULL DEFAULT 'gestores',
  ADD COLUMN IF NOT EXISTS interest_areas text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rss_sources text[] DEFAULT '{}';


-- ============================================
-- Migration: 20260217224041_25d3c339-077f-48ae-92bb-021dbe4efeb7.sql
-- ============================================

-- System template sets (global styles available to all users)
CREATE TABLE public.system_template_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'geral',
  content_format text NOT NULL DEFAULT 'post',
  template_set jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_colors jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_template_sets ENABLE ROW LEVEL SECURITY;

-- Everyone can read system templates
CREATE POLICY "Anyone can view active system templates"
  ON public.system_template_sets FOR SELECT
  USING (is_active = true);

-- Favorite template sets (user bookmarks)
CREATE TABLE public.favorite_template_sets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  template_set_type text NOT NULL CHECK (template_set_type IN ('system', 'brand')),
  template_set_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, template_set_type, template_set_id)
);

ALTER TABLE public.favorite_template_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their favorites"
  ON public.favorite_template_sets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites"
  ON public.favorite_template_sets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove favorites"
  ON public.favorite_template_sets FOR DELETE
  USING (auth.uid() = user_id);


-- ============================================
-- Migration: 20260217224651_75559ec8-0fa1-4b60-812e-1690d9cdaad8.sql
-- ============================================

-- Add generation metadata column to track debug/observability info
ALTER TABLE public.generated_contents
ADD COLUMN generation_metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.generated_contents.generation_metadata IS 'Stores generation debug info: model, timing_ms, slide_image_times, errors, warnings';


-- ============================================
-- Migration: 20260217230239_24860e58-b93a-4e1f-a187-34cb2bc6053a.sql
-- ============================================

-- Expand system_template_sets with reference/preview images and format support
ALTER TABLE public.system_template_sets
  ADD COLUMN IF NOT EXISTS reference_images jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS preview_images jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supported_formats text[] DEFAULT '{post}'::text[],
  ADD COLUMN IF NOT EXISTS is_native boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS style_prompt text;

-- Add preferred_language to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'pt-BR';

-- Update existing system templates with supported_formats based on content_format
UPDATE public.system_template_sets
SET supported_formats = ARRAY[content_format]
WHERE supported_formats = '{post}' AND content_format != 'post';


-- ============================================
-- Migration: 20260218000050_a44bb7d6-5250-4f35-8d67-016d2ca980b0.sql
-- ============================================

-- Add render_mode feature flag to brands table
-- "LEGACY_FULL_IMAGE" = current behavior (default)
-- "AI_BG_OVERLAY" = new mode: AI generates background only, text is overlaid by app
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS render_mode text NOT NULL DEFAULT 'LEGACY_FULL_IMAGE';

-- Add comment for documentation
COMMENT ON COLUMN public.brands.render_mode IS 'Controls image generation mode: LEGACY_FULL_IMAGE (AI renders text in image) or AI_BG_OVERLAY (AI generates background only, text overlaid by app)';


-- ============================================
-- Migration: 20260219160015_be4fcc33-92d2-4794-89bb-500375791128.sql
-- ============================================
ALTER TABLE public.generated_contents DROP CONSTRAINT generated_contents_status_check;

ALTER TABLE public.generated_contents ADD CONSTRAINT generated_contents_status_check CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'rejected'::text, 'ready'::text, 'downloaded'::text]));

-- ============================================
-- Migration: 20260226120711_da850a48-09c3-4341-bb06-dc67afc9124a.sql
-- ============================================

CREATE TABLE public.brand_background_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  content_format text NOT NULL DEFAULT 'post',
  slide_count integer NOT NULL DEFAULT 1,
  background_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_content_id uuid REFERENCES public.generated_contents(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_background_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bg templates of their brands"
  ON public.brand_background_templates FOR SELECT
  USING (is_brand_visible_to_user(brand_id, auth.uid()));

CREATE POLICY "Users can create bg templates for their brands"
  ON public.brand_background_templates FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_background_templates.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can update bg templates of their brands"
  ON public.brand_background_templates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_background_templates.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can delete bg templates of their brands"
  ON public.brand_background_templates FOR DELETE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_background_templates.brand_id AND b.owner_user_id = auth.uid()));

CREATE TRIGGER update_brand_background_templates_updated_at
  BEFORE UPDATE ON public.brand_background_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================
-- Migration: 20260303142637_7d20bb11-f910-4906-88bd-ebfabcd0a047.sql
-- ============================================

-- Add platform column to generated_contents (default 'instagram' for backward compat)
ALTER TABLE public.generated_contents 
ADD COLUMN platform text NOT NULL DEFAULT 'instagram';

-- Add supported_platforms to system_template_sets
ALTER TABLE public.system_template_sets
ADD COLUMN supported_platforms text[] DEFAULT '{instagram}'::text[];

-- Update existing system_template_sets to include instagram
UPDATE public.system_template_sets SET supported_platforms = '{instagram}'::text[] WHERE supported_platforms IS NULL;


-- ============================================
-- Migration: 20260303163506_78279bd3-7b01-4120-8c06-5cbfb3d80058.sql
-- ============================================

-- Table to store Instagram Business account connections per user
CREATE TABLE public.instagram_connections (
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

-- Enable RLS
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own connections
CREATE POLICY "Users can view their own connections"
  ON public.instagram_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections"
  ON public.instagram_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
  ON public.instagram_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
  ON public.instagram_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_instagram_connections_updated_at
  BEFORE UPDATE ON public.instagram_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add published_platform_id to track which post was published where
ALTER TABLE public.generated_contents 
  ADD COLUMN IF NOT EXISTS instagram_media_id text,
  ADD COLUMN IF NOT EXISTS publish_error text,
  ADD COLUMN IF NOT EXISTS publish_attempts integer DEFAULT 0;


-- ============================================
-- Migration: 20260306211928_6145475c-88b0-459e-b4c3-d00f2df6d04e.sql
-- ============================================
-- Drop and recreate the INSERT policy to allow shared users
DROP POLICY IF EXISTS "Users can create bg templates for their brands" ON public.brand_background_templates;

CREATE POLICY "Users can create bg templates for their brands"
ON public.brand_background_templates
FOR INSERT
TO authenticated
WITH CHECK (is_brand_visible_to_user(brand_id, auth.uid()));

-- Also fix UPDATE and DELETE to allow shared users
DROP POLICY IF EXISTS "Users can update bg templates of their brands" ON public.brand_background_templates;

CREATE POLICY "Users can update bg templates of their brands"
ON public.brand_background_templates
FOR UPDATE
TO authenticated
USING (is_brand_visible_to_user(brand_id, auth.uid()));

DROP POLICY IF EXISTS "Users can delete bg templates of their brands" ON public.brand_background_templates;

CREATE POLICY "Users can delete bg templates of their brands"
ON public.brand_background_templates
FOR DELETE
TO authenticated
USING (is_brand_visible_to_user(brand_id, auth.uid()));

-- ============================================
-- Migration: 20260310135423_6fce1df2-a47d-4a80-9350-2f912aedf24f.sql
-- ============================================
ALTER TABLE public.ai_user_context ADD COLUMN whatsapp_number text;

-- ============================================
-- Migration: 20260310142907_155485cf-69c0-46bb-a3cb-181caa7ec077.sql
-- ============================================
CREATE OR REPLACE FUNCTION get_cron_users_due()
RETURNS TABLE (
  user_id uuid,
  whatsapp_number text,
  business_niche text,
  brand_voice text,
  content_topics text[],
  extra_context jsonb,
  qty_suggestions int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.user_id,
    u.whatsapp_number,
    u.business_niche,
    u.brand_voice,
    u.content_topics,
    u.extra_context,
    c.qty_suggestions
  FROM ai_cron_config c
  JOIN ai_user_context u ON u.user_id = c.user_id
  WHERE c.active = true
    AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC')::int = ANY(c.days_of_week)
    AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')::int = c.hour_utc
    AND (
      c.last_run_at IS NULL 
      OR c.last_run_at < NOW() - INTERVAL '20 hours'
    )
    AND u.onboarding_done = true;
$$;

GRANT EXECUTE ON FUNCTION get_cron_users_due() TO anon;
GRANT EXECUTE ON FUNCTION get_cron_users_due() TO authenticated;

-- ============================================
-- Migration: 20260313012915_94d4f1ba-2230-4830-b09f-60ecc9e03f21.sql
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.image_generations;

-- ============================================
-- Migration: 20260313201337_fbba9c72-c10c-4ff4-8350-cc90d5803fdb.sql
-- ============================================
ALTER TABLE public.generated_contents ADD COLUMN IF NOT EXISTS rendered_image_urls text[] DEFAULT NULL;

-- ============================================
-- Migration: 20260315011041_8d155637-86fe-4121-878b-fca22a6308c1.sql
-- ============================================

-- Add user_id column to trends
ALTER TABLE public.trends ADD COLUMN IF NOT EXISTS user_id uuid;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_trends_user_id ON public.trends(user_id);
CREATE INDEX IF NOT EXISTS idx_trends_theme ON public.trends(theme) WHERE is_active = true;

-- Drop existing RLS policies
DROP POLICY IF EXISTS "Authenticated users can view trends" ON public.trends;

-- New RLS: users see their own + global trends
CREATE POLICY "Users can view own and global trends"
  ON public.trends FOR SELECT TO authenticated
  USING (is_active = true AND (user_id = auth.uid() OR user_id IS NULL));

-- Allow insert
CREATE POLICY "Service can insert trends"
  ON public.trends FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to update their own trends
CREATE POLICY "Users can update own trends"
  ON public.trends FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Allow users to delete their own trends
CREATE POLICY "Users can delete own trends"
  ON public.trends FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ============================================
-- Migration: 20260315025119_fe43c05d-3b73-4e6a-9811-2eac8d3b344f.sql
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_contents;

-- ============================================
-- Migration: 20260315155817_5743ac44-cfa3-4366-96ee-5e7eeddd5e1c.sql
-- ============================================
INSERT INTO public.brand_shares (brand_id, shared_with_user_id, permission) VALUES ('ec5c3308-4431-4946-9551-dc1023b7189b', '1294d060-6783-4f7a-9df4-3c5f567eded4', 'read'), ('3907b2c9-7c96-455d-81ac-5ea4982b6927', '1294d060-6783-4f7a-9df4-3c5f567eded4', 'read') ON CONFLICT DO NOTHING;

-- ============================================
-- Migration: 20260315220623_68a0a666-aff2-4202-b5db-c7f4f827aae5.sql
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- ============================================
-- Migration: 20260316112619_add_visual_preferences_to_brands.sql
-- ============================================
-- Add visual_preferences JSONB column to brands table
-- Stores user-specified preferences like phone_mockup, body_in_card, etc.
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS visual_preferences jsonb DEFAULT NULL;


-- ============================================
-- Migration: 20260316220521_87182712-7192-4f24-8a13-2e3077c04c59.sql
-- ============================================
-- LinkedIn connections table
CREATE TABLE public.linkedin_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  linkedin_user_id text NOT NULL,
  linkedin_name text,
  linkedin_email text,
  linkedin_profile_url text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  scopes text[] DEFAULT '{}'::text[],
  organization_id text,
  organization_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.linkedin_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own LinkedIn connections"
  ON public.linkedin_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own LinkedIn connections"
  ON public.linkedin_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own LinkedIn connections"
  ON public.linkedin_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own LinkedIn connections"
  ON public.linkedin_connections FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_linkedin_connections_updated_at
  BEFORE UPDATE ON public.linkedin_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration: 20260317112700_add_brand_creation_mode_and_purpose.sql
-- ============================================
-- Add creation_mode to brands (style_copy = existing behavior)
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS creation_mode text NOT NULL DEFAULT 'style_copy';

-- Add purpose to brand_examples (reference = style analysis, background = user photos as bg)
ALTER TABLE public.brand_examples
ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'reference';

-- Index for fast background photo lookup during generation
CREATE INDEX IF NOT EXISTS idx_brand_examples_purpose
ON public.brand_examples (brand_id, purpose) WHERE purpose = 'background';


-- ============================================
-- Migration: 20260318_billing_tables.sql
-- ============================================
-- ══════════════════════════════════════════════════════════════
-- TrendPulse Billing Tables
-- Run this in Supabase SQL Editor to create billing infrastructure
-- ══════════════════════════════════════════════════════════════

-- 1. Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,           -- 'free', 'pro', 'business'
  display_name text NOT NULL,          -- 'Gratuito', 'Pro', 'Business'
  price_monthly integer NOT NULL,      -- centavos (ex: 9700 = R$97)
  price_yearly integer,                -- centavos (desconto anual)
  generation_limit integer NOT NULL,   -- gerações/mês (5, 999999, 999999)
  brand_limit integer NOT NULL,        -- marcas (1, 3, 10)
  features jsonb DEFAULT '{}',         -- recursos extras por plano
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2. User Subscriptions
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  plan_id uuid REFERENCES subscription_plans NOT NULL,
  status text NOT NULL DEFAULT 'active',  -- active, canceled, past_due, trialing
  asaas_subscription_id text,
  asaas_customer_id text,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- 3. Usage Tracking
CREATE TABLE IF NOT EXISTS usage_tracking (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  period_start date NOT NULL,           -- primeiro dia do mês
  generations_count integer DEFAULT 0,
  publications_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, period_start)
);

-- 4. Row Level Security
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

-- Plans are readable by everyone
CREATE POLICY "Plans are publicly readable"
  ON subscription_plans FOR SELECT
  USING (true);

-- Users can only see their own subscription
CREATE POLICY "Users can view own subscription"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only see their own usage
CREATE POLICY "Users can view own usage"
  ON usage_tracking FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can manage all (for edge functions)
CREATE POLICY "Service role manages subscriptions"
  ON user_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role manages usage"
  ON usage_tracking FOR ALL
  USING (true)
  WITH CHECK (true);

-- 5. Seed default plans (upsert to keep plans in sync)
INSERT INTO subscription_plans (name, display_name, price_monthly, price_yearly, generation_limit, brand_limit, features) VALUES
  ('free', 'Gratuito', 0, 0, 5, 1, '{"scheduling": false, "direct_publish": false, "pdf_export": false, "premium_images": false, "analytics": false}'),
  ('pro', 'Pro', 14790, 147900, 100, 5, '{"scheduling": true, "direct_publish": true, "pdf_export": true, "premium_images": true, "layout_analysis": true, "priority_support": true, "analytics": false}'),
  ('business', 'Business', 29700, 297000, 999999, 10, '{"scheduling": true, "direct_publish": true, "pdf_export": true, "premium_images": true, "layout_analysis": true, "analytics": true, "api_access": true, "multi_social": true, "dedicated_support": true, "custom_onboarding": true}')
ON CONFLICT (name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  generation_limit = EXCLUDED.generation_limit,
  brand_limit = EXCLUDED.brand_limit,
  features = EXCLUDED.features;

-- 6. Index for fast usage lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON usage_tracking (user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions (user_id);


-- ============================================
-- Migration: 20260318_content_metrics.sql
-- ============================================
-- Content Metrics — cached engagement data from Instagram/LinkedIn
CREATE TABLE IF NOT EXISTS content_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES generated_contents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  platform text NOT NULL,           -- 'instagram', 'linkedin'
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  engagement_rate numeric(5,2) DEFAULT 0,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(content_id)
);

ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON content_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages metrics"
  ON content_metrics FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_content_metrics_user ON content_metrics (user_id);
CREATE INDEX IF NOT EXISTS idx_content_metrics_content ON content_metrics (content_id);


-- ============================================
-- Migration: 20260318175632_6da307cc-89b4-48cd-a771-ed09eb68b330.sql
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('guides', 'guides', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read guides" ON storage.objects
FOR SELECT USING (bucket_id = 'guides');

CREATE POLICY "Auth upload guides" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (bucket_id = 'guides');

-- ============================================
-- Migration: 20260323_visual_style_defaults_and_photo_library.sql
-- ============================================
-- Add default_visual_style to brands table
ALTER TABLE public.brands
ADD COLUMN IF NOT EXISTS default_visual_style text DEFAULT NULL;

-- Backfill existing brands based on creation_mode
UPDATE public.brands SET default_visual_style = 'photo_overlay' WHERE creation_mode = 'photo_backgrounds' AND default_visual_style IS NULL;
UPDATE public.brands SET default_visual_style = 'ai_background' WHERE creation_mode = 'style_copy' AND default_visual_style IS NULL;
UPDATE public.brands SET default_visual_style = 'ai_background' WHERE creation_mode = 'inspired' AND default_visual_style IS NULL;
-- from_scratch: leave NULL (user chooses each time)

-- Create user_photo_library table for persistent photo gallery
CREATE TABLE IF NOT EXISTS public.user_photo_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_photo_library ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own photos
CREATE POLICY "Users can manage own photos"
  ON public.user_photo_library
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_photo_library_user_id
  ON public.user_photo_library (user_id, created_at DESC);



-- ============================================
-- Post-migration fix: content_type constraint
-- ============================================
ALTER TABLE generated_contents DROP CONSTRAINT IF EXISTS generated_contents_content_type_check;
ALTER TABLE generated_contents ADD CONSTRAINT generated_contents_content_type_check
  CHECK (content_type IN ('post', 'story', 'carousel', 'document', 'article', 'cron_config'));

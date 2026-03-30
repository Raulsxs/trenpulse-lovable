
-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  company_name TEXT,
  instagram_handle TEXT,
  native_language text NOT NULL DEFAULT 'pt-BR',
  secondary_languages text[] DEFAULT '{}',
  preferred_tone text NOT NULL DEFAULT 'profissional',
  preferred_audience text NOT NULL DEFAULT 'gestores',
  interest_areas text[] DEFAULT '{}',
  rss_sources text[] DEFAULT '{}',
  preferred_language text NOT NULL DEFAULT 'pt-BR',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- trends
CREATE TABLE IF NOT EXISTS public.trends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  source_url TEXT,
  theme TEXT NOT NULL,
  relevance_score INTEGER DEFAULT 50 CHECK (relevance_score >= 0 AND relevance_score <= 100),
  keywords TEXT[],
  is_active BOOLEAN DEFAULT true,
  user_id uuid,
  scraped_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.trends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can view trends" ON public.trends;
DO $$ BEGIN CREATE POLICY "Users can view own and global trends" ON public.trends FOR SELECT TO authenticated USING (is_active = true AND (user_id = auth.uid() OR user_id IS NULL)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Service can insert trends" ON public.trends FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update own trends" ON public.trends FOR UPDATE TO authenticated USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete own trends" ON public.trends FOR DELETE TO authenticated USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_trends_user_id ON public.trends(user_id);
CREATE INDEX IF NOT EXISTS idx_trends_theme ON public.trends(theme) WHERE is_active = true;

-- generated_contents
CREATE TABLE IF NOT EXISTS public.generated_contents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trend_id UUID REFERENCES public.trends(id) ON DELETE SET NULL,
  content_type TEXT NOT NULL DEFAULT 'post',
  title TEXT NOT NULL,
  caption TEXT,
  hashtags TEXT[],
  slides JSONB DEFAULT '[]'::jsonb,
  image_urls TEXT[],
  status TEXT DEFAULT 'draft',
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  brand_id uuid,
  brand_snapshot jsonb DEFAULT NULL,
  visual_mode text NOT NULL DEFAULT 'brand_guided',
  source_summary text,
  key_insights text[],
  template_set_id uuid,
  slide_count integer DEFAULT NULL,
  include_cta boolean DEFAULT true,
  published_at timestamptz NULL,
  generation_metadata jsonb DEFAULT '{}'::jsonb,
  platform text NOT NULL DEFAULT 'instagram',
  instagram_media_id text,
  publish_error text,
  publish_attempts integer DEFAULT 0,
  rendered_image_urls text[] DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.generated_contents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their own content" ON public.generated_contents FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can insert their own content" ON public.generated_contents FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can update their own content" ON public.generated_contents FOR UPDATE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can delete their own content" ON public.generated_contents FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DROP TRIGGER IF EXISTS update_generated_contents_updated_at ON public.generated_contents;
CREATE TRIGGER update_generated_contents_updated_at BEFORE UPDATE ON public.generated_contents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_generated_contents_brand_id ON public.generated_contents(brand_id);
CREATE INDEX IF NOT EXISTS idx_generated_contents_user_scheduled ON public.generated_contents (user_id, scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_generated_contents_user_status ON public.generated_contents (user_id, status);

-- saved_trends
CREATE TABLE IF NOT EXISTS public.saved_trends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  trend_id UUID NOT NULL REFERENCES public.trends(id) ON DELETE CASCADE,
  saved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, trend_id)
);
ALTER TABLE public.saved_trends ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "Users can view their saved trends" ON public.saved_trends FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can save trends" ON public.saved_trends FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "Users can unsave trends" ON public.saved_trends FOR DELETE USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

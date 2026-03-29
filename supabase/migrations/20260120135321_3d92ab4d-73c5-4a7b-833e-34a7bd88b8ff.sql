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
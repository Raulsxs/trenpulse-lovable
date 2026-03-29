
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

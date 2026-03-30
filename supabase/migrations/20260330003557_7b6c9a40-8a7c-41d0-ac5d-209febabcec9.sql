
-- slide_versions
CREATE TABLE IF NOT EXISTS public.slide_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  version INT NOT NULL,
  slide_text TEXT, layout_preset TEXT,
  selected_image_generation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(slide_id, version)
);
ALTER TABLE public.slide_versions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "sv_sel" ON public.slide_versions FOR SELECT USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = slide_versions.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- quality_feedback
CREATE TABLE IF NOT EXISTS public.quality_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  image_generation_id UUID NOT NULL REFERENCES public.image_generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote TEXT NOT NULL,
  reasons JSONB DEFAULT '[]'::jsonb, notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_vote CHECK (vote IN ('up', 'down'))
);
ALTER TABLE public.quality_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "qf_sel" ON public.quality_feedback FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "qf_ins" ON public.quality_feedback FOR INSERT WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- quality_metrics
CREATE TABLE IF NOT EXISTS public.quality_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slide_id UUID NOT NULL REFERENCES public.slides(id) ON DELETE CASCADE,
  adherence INT CHECK (adherence >= 0 AND adherence <= 5),
  legibility INT CHECK (legibility >= 0 AND legibility <= 5),
  brand_consistency INT CHECK (brand_consistency >= 0 AND brand_consistency <= 5),
  premium_look INT CHECK (premium_look >= 0 AND premium_look <= 5),
  publish_ready BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.quality_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "qm_sel" ON public.quality_metrics FOR SELECT USING (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = quality_metrics.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "qm_ins" ON public.quality_metrics FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.slides s JOIN public.posts po ON po.id = s.post_id JOIN public.projects p ON p.id = po.project_id JOIN public.brands b ON b.id = p.brand_id WHERE s.id = quality_metrics.slide_id AND b.owner_user_id = auth.uid())); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- subscription_plans (billing)
DROP TABLE IF EXISTS public.subscription_plans CASCADE;
CREATE TABLE public.subscription_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  price_monthly integer NOT NULL,
  price_yearly integer,
  generation_limit integer NOT NULL,
  brand_limit integer NOT NULL,
  features jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "sp_sel" ON public.subscription_plans FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Recreate user_subscriptions with billing fields
DROP TABLE IF EXISTS public.user_subscriptions CASCADE;
CREATE TABLE public.user_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  plan_id uuid REFERENCES public.subscription_plans NOT NULL,
  status text NOT NULL DEFAULT 'active',
  asaas_subscription_id text, asaas_customer_id text,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "us_sel" ON public.user_subscriptions FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "us_svc" ON public.user_subscriptions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- content_metrics
CREATE TABLE IF NOT EXISTS public.content_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES public.generated_contents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  platform text NOT NULL,
  likes integer DEFAULT 0, comments integer DEFAULT 0,
  shares integer DEFAULT 0, saves integer DEFAULT 0,
  reach integer DEFAULT 0, impressions integer DEFAULT 0,
  engagement_rate numeric(5,2) DEFAULT 0,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(content_id)
);
ALTER TABLE public.content_metrics ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "cm_sel" ON public.content_metrics FOR SELECT USING (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "cm_svc" ON public.content_metrics FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- user_photo_library
CREATE TABLE IF NOT EXISTS public.user_photo_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL, label text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.user_photo_library ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "upl_all" ON public.user_photo_library FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_user_photo_library_user_id ON public.user_photo_library (user_id, created_at DESC);

-- Missing columns
ALTER TABLE public.slides ADD COLUMN IF NOT EXISTS image_layout_params jsonb DEFAULT NULL;
ALTER TABLE public.trends ADD COLUMN IF NOT EXISTS full_content text;

-- Add FK for generated_contents columns that reference new tables
ALTER TABLE public.generated_contents ADD COLUMN IF NOT EXISTS brand_id uuid;
ALTER TABLE public.generated_contents ADD COLUMN IF NOT EXISTS template_set_id uuid;

-- Usage tracking indexes
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_period ON public.usage_tracking (user_id, period_start);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON public.user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_content_metrics_user ON public.content_metrics (user_id);
CREATE INDEX IF NOT EXISTS idx_content_metrics_content ON public.content_metrics (content_id);

-- Seed default plans
INSERT INTO public.subscription_plans (name, display_name, price_monthly, price_yearly, generation_limit, brand_limit, features) VALUES
  ('free', 'Gratuito', 0, 0, 5, 1, '{"scheduling": false, "direct_publish": false, "pdf_export": false, "premium_images": false, "analytics": false}'),
  ('pro', 'Pro', 14790, 147900, 100, 5, '{"scheduling": true, "direct_publish": true, "pdf_export": true, "premium_images": true, "layout_analysis": true, "priority_support": true, "analytics": false}'),
  ('business', 'Business', 29700, 297000, 999999, 10, '{"scheduling": true, "direct_publish": true, "pdf_export": true, "premium_images": true, "layout_analysis": true, "analytics": true, "api_access": true, "multi_social": true, "dedicated_support": true, "custom_onboarding": true}')
ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, price_monthly = EXCLUDED.price_monthly, price_yearly = EXCLUDED.price_yearly, generation_limit = EXCLUDED.generation_limit, brand_limit = EXCLUDED.brand_limit, features = EXCLUDED.features;

-- get_cron_users_due function
CREATE OR REPLACE FUNCTION get_cron_users_due()
RETURNS TABLE (user_id uuid, whatsapp_number text, business_niche text, brand_voice text, content_topics text[], extra_context jsonb, qty_suggestions int)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.user_id, u.whatsapp_number, u.business_niche, u.brand_voice, u.content_topics, u.extra_context, c.qty_suggestions
  FROM ai_cron_config c JOIN ai_user_context u ON u.user_id = c.user_id
  WHERE c.active = true AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC')::int = ANY(c.days_of_week) AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')::int = c.hour_utc AND (c.last_run_at IS NULL OR c.last_run_at < NOW() - INTERVAL '20 hours') AND u.onboarding_done = true;
$$;
GRANT EXECUTE ON FUNCTION get_cron_users_due() TO anon;
GRANT EXECUTE ON FUNCTION get_cron_users_due() TO authenticated;

-- Content type constraint fix
ALTER TABLE public.generated_contents DROP CONSTRAINT IF EXISTS generated_contents_content_type_check;
ALTER TABLE public.generated_contents ADD CONSTRAINT generated_contents_content_type_check CHECK (content_type IN ('post', 'story', 'carousel', 'document', 'article', 'cron_config'));

-- Status constraint fix
ALTER TABLE public.generated_contents DROP CONSTRAINT IF EXISTS generated_contents_status_check;
ALTER TABLE public.generated_contents ADD CONSTRAINT generated_contents_status_check CHECK (status = ANY (ARRAY['draft','approved','scheduled','published','rejected','ready','downloaded']));

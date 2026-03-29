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

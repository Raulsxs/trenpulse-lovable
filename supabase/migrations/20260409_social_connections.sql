-- Social connections via Post for Me
-- Stores user's connected social media accounts
CREATE TABLE IF NOT EXISTS public.social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL, -- instagram, linkedin, tiktok, x, facebook, pinterest, bluesky, threads, youtube
  pfm_account_id text, -- Post for Me account ID
  status text DEFAULT 'connected', -- connected, disconnected, error
  account_name text, -- Display name from the platform
  connected_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- RLS
ALTER TABLE public.social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON public.social_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON public.social_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON public.social_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON public.social_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can manage all (for edge functions)
CREATE POLICY "Service role full access"
  ON public.social_connections FOR ALL
  USING (auth.role() = 'service_role');

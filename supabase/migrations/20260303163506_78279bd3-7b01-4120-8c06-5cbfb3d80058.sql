
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

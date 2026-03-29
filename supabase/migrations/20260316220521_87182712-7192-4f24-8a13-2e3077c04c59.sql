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
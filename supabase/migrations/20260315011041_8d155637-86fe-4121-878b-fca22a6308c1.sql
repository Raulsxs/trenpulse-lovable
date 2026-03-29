
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

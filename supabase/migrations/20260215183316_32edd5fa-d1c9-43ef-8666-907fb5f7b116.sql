
-- Add published_at column to generated_contents
ALTER TABLE public.generated_contents 
ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

-- Create indexes for calendar queries
CREATE INDEX IF NOT EXISTS idx_generated_contents_user_scheduled 
ON public.generated_contents (user_id, scheduled_at) 
WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generated_contents_user_status 
ON public.generated_contents (user_id, status);

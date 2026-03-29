
-- Add platform column to generated_contents (default 'instagram' for backward compat)
ALTER TABLE public.generated_contents 
ADD COLUMN platform text NOT NULL DEFAULT 'instagram';

-- Add supported_platforms to system_template_sets
ALTER TABLE public.system_template_sets
ADD COLUMN supported_platforms text[] DEFAULT '{instagram}'::text[];

-- Update existing system_template_sets to include instagram
UPDATE public.system_template_sets SET supported_platforms = '{instagram}'::text[] WHERE supported_platforms IS NULL;

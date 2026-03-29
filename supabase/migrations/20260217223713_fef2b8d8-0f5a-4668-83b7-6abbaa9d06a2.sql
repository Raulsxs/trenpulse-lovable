
-- Add V2 profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS native_language text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS secondary_languages text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_tone text NOT NULL DEFAULT 'profissional',
  ADD COLUMN IF NOT EXISTS preferred_audience text NOT NULL DEFAULT 'gestores',
  ADD COLUMN IF NOT EXISTS interest_areas text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rss_sources text[] DEFAULT '{}';

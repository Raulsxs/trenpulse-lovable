-- Add visual_preferences JSONB column to brands table
-- Stores user-specified preferences like phone_mockup, body_in_card, etc.
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS visual_preferences jsonb DEFAULT NULL;

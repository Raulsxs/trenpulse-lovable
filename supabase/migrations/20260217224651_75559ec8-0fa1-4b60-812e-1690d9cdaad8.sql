
-- Add generation metadata column to track debug/observability info
ALTER TABLE public.generated_contents
ADD COLUMN generation_metadata jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.generated_contents.generation_metadata IS 'Stores generation debug info: model, timing_ms, slide_image_times, errors, warnings';

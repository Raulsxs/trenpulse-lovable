-- Create brand_examples table for reference content
CREATE TABLE public.brand_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  thumb_url TEXT,
  description TEXT,
  content_type TEXT DEFAULT 'geral',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.brand_examples ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view examples of their brands"
ON public.brand_examples FOR SELECT
USING (EXISTS (
  SELECT 1 FROM brands b
  WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
));

CREATE POLICY "Users can create examples for their brands"
ON public.brand_examples FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM brands b
  WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
));

CREATE POLICY "Users can delete examples of their brands"
ON public.brand_examples FOR DELETE
USING (EXISTS (
  SELECT 1 FROM brands b
  WHERE b.id = brand_examples.brand_id AND b.owner_user_id = auth.uid()
));

-- Index for fast lookups
CREATE INDEX idx_brand_examples_brand_id ON public.brand_examples(brand_id);
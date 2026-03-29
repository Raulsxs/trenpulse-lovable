
-- Create brand_template_sets table
CREATE TABLE public.brand_template_sets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source_example_ids JSONB DEFAULT '[]'::jsonb,
  template_set JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add default_template_set_id to brands
ALTER TABLE public.brands ADD COLUMN default_template_set_id UUID REFERENCES public.brand_template_sets(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.brand_template_sets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view template sets of their brands"
  ON public.brand_template_sets FOR SELECT
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can create template sets for their brands"
  ON public.brand_template_sets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can update template sets of their brands"
  ON public.brand_template_sets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can delete template sets of their brands"
  ON public.brand_template_sets FOR DELETE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_template_sets.brand_id AND b.owner_user_id = auth.uid()));

-- Index
CREATE INDEX idx_brand_template_sets_brand_id ON public.brand_template_sets(brand_id);

-- Trigger for updated_at
CREATE TRIGGER update_brand_template_sets_updated_at
  BEFORE UPDATE ON public.brand_template_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

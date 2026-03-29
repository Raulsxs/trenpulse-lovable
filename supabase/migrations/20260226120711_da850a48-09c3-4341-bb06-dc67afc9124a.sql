
CREATE TABLE public.brand_background_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  content_format text NOT NULL DEFAULT 'post',
  slide_count integer NOT NULL DEFAULT 1,
  background_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_content_id uuid REFERENCES public.generated_contents(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.brand_background_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bg templates of their brands"
  ON public.brand_background_templates FOR SELECT
  USING (is_brand_visible_to_user(brand_id, auth.uid()));

CREATE POLICY "Users can create bg templates for their brands"
  ON public.brand_background_templates FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_background_templates.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can update bg templates of their brands"
  ON public.brand_background_templates FOR UPDATE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_background_templates.brand_id AND b.owner_user_id = auth.uid()));

CREATE POLICY "Users can delete bg templates of their brands"
  ON public.brand_background_templates FOR DELETE
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = brand_background_templates.brand_id AND b.owner_user_id = auth.uid()));

CREATE TRIGGER update_brand_background_templates_updated_at
  BEFORE UPDATE ON public.brand_background_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

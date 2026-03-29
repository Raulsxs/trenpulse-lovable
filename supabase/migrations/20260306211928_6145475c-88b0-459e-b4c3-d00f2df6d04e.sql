-- Drop and recreate the INSERT policy to allow shared users
DROP POLICY IF EXISTS "Users can create bg templates for their brands" ON public.brand_background_templates;

CREATE POLICY "Users can create bg templates for their brands"
ON public.brand_background_templates
FOR INSERT
TO authenticated
WITH CHECK (is_brand_visible_to_user(brand_id, auth.uid()));

-- Also fix UPDATE and DELETE to allow shared users
DROP POLICY IF EXISTS "Users can update bg templates of their brands" ON public.brand_background_templates;

CREATE POLICY "Users can update bg templates of their brands"
ON public.brand_background_templates
FOR UPDATE
TO authenticated
USING (is_brand_visible_to_user(brand_id, auth.uid()));

DROP POLICY IF EXISTS "Users can delete bg templates of their brands" ON public.brand_background_templates;

CREATE POLICY "Users can delete bg templates of their brands"
ON public.brand_background_templates
FOR DELETE
TO authenticated
USING (is_brand_visible_to_user(brand_id, auth.uid()));

-- Create a security definer function to check brand sharing without recursion
CREATE OR REPLACE FUNCTION public.is_brand_visible_to_user(_brand_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.brands WHERE id = _brand_id AND owner_user_id = _user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.brand_shares WHERE brand_id = _brand_id AND shared_with_user_id = _user_id
  )
$$;

-- Fix brands SELECT policy
DROP POLICY IF EXISTS "Users can view their own or shared brands" ON public.brands;
DROP POLICY IF EXISTS "Users can view their own brands" ON public.brands;
CREATE POLICY "Users can view their own or shared brands"
  ON public.brands FOR SELECT
  USING (public.is_brand_visible_to_user(id, auth.uid()));

-- Fix brand_examples SELECT policy
DROP POLICY IF EXISTS "Users can view examples of their own or shared brands" ON public.brand_examples;
DROP POLICY IF EXISTS "Users can view examples of their brands" ON public.brand_examples;
CREATE POLICY "Users can view examples of their own or shared brands"
  ON public.brand_examples FOR SELECT
  USING (public.is_brand_visible_to_user(brand_id, auth.uid()));

-- Fix brand_template_sets SELECT policy
DROP POLICY IF EXISTS "Users can view template sets of their own or shared brands" ON public.brand_template_sets;
DROP POLICY IF EXISTS "Users can view template sets of their brands" ON public.brand_template_sets;
CREATE POLICY "Users can view template sets of their own or shared brands"
  ON public.brand_template_sets FOR SELECT
  USING (public.is_brand_visible_to_user(brand_id, auth.uid()));

-- Fix brand_example_categories SELECT policy
DROP POLICY IF EXISTS "Users can view categories of their own or shared brands" ON public.brand_example_categories;
DROP POLICY IF EXISTS "Users can view categories of their brands" ON public.brand_example_categories;
CREATE POLICY "Users can view categories of their own or shared brands"
  ON public.brand_example_categories FOR SELECT
  USING (public.is_brand_visible_to_user(brand_id, auth.uid()));

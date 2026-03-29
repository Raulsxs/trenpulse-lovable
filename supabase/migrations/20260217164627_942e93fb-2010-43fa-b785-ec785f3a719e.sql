
-- Create brand sharing table
CREATE TABLE public.brand_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  shared_with_user_id uuid NOT NULL,
  permission text NOT NULL DEFAULT 'read',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand_id, shared_with_user_id)
);

ALTER TABLE public.brand_shares ENABLE ROW LEVEL SECURITY;

-- Owner can manage shares
CREATE POLICY "Brand owners can manage shares"
  ON public.brand_shares FOR ALL
  USING (EXISTS (
    SELECT 1 FROM brands b WHERE b.id = brand_shares.brand_id AND b.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM brands b WHERE b.id = brand_shares.brand_id AND b.owner_user_id = auth.uid()
  ));

-- Shared users can see their shares
CREATE POLICY "Shared users can view their shares"
  ON public.brand_shares FOR SELECT
  USING (shared_with_user_id = auth.uid());

-- Update brands SELECT policy to include shared users
DROP POLICY IF EXISTS "Users can view their own brands" ON public.brands;
CREATE POLICY "Users can view their own or shared brands"
  ON public.brands FOR SELECT
  USING (
    auth.uid() = owner_user_id
    OR EXISTS (
      SELECT 1 FROM public.brand_shares bs
      WHERE bs.brand_id = brands.id AND bs.shared_with_user_id = auth.uid()
    )
  );

-- Update brand_examples SELECT policy
DROP POLICY IF EXISTS "Users can view examples of their brands" ON public.brand_examples;
CREATE POLICY "Users can view examples of their own or shared brands"
  ON public.brand_examples FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_examples.brand_id
    AND (
      b.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.brand_shares bs WHERE bs.brand_id = b.id AND bs.shared_with_user_id = auth.uid())
    )
  ));

-- Update brand_template_sets SELECT policy
DROP POLICY IF EXISTS "Users can view template sets of their brands" ON public.brand_template_sets;
CREATE POLICY "Users can view template sets of their own or shared brands"
  ON public.brand_template_sets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_template_sets.brand_id
    AND (
      b.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.brand_shares bs WHERE bs.brand_id = b.id AND bs.shared_with_user_id = auth.uid())
    )
  ));

-- Update brand_example_categories SELECT policy
DROP POLICY IF EXISTS "Users can view categories of their brands" ON public.brand_example_categories;
CREATE POLICY "Users can view categories of their own or shared brands"
  ON public.brand_example_categories FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM brands b
    WHERE b.id = brand_example_categories.brand_id
    AND (
      b.owner_user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.brand_shares bs WHERE bs.brand_id = b.id AND bs.shared_with_user_id = auth.uid())
    )
  ));

-- Insert the share: raul's brands shared with maikon
INSERT INTO public.brand_shares (brand_id, shared_with_user_id, permission)
SELECT id, '58a0c7ec-faf7-4b70-91cd-ce335100f66f', 'read'
FROM public.brands
WHERE owner_user_id = '1294d060-6783-4f7a-9df4-3c5f567eded4';

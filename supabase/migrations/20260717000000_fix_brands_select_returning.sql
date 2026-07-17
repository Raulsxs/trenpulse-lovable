-- Fix: a policy de SELECT de brands usava SÓ is_brand_visible_to_user(id, auth.uid()) — uma função
-- STABLE que consulta a própria tabela e NÃO enxerga a linha recém-inserida durante INSERT...RETURNING.
-- Isso fazia .insert().select() (padrão do supabase-js) falhar com RLS 42501 → TODA criação de marca
-- pelo front quebrava (inclusive o onboarding, que engolia o erro).
-- Correção: adiciona o check inline owner_user_id = auth.uid() (que enxerga a linha nova diretamente),
-- mantendo o compartilhamento via is_brand_visible_to_user.
DROP POLICY IF EXISTS "Users can view their own or shared brands" ON public.brands;
CREATE POLICY "Users can view their own or shared brands" ON public.brands
  FOR SELECT
  USING (owner_user_id = auth.uid() OR is_brand_visible_to_user(id, auth.uid()));

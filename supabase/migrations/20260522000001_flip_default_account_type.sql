-- Fase 2 fechada: flipa o default de account_type pra self_serve em novos signups.
-- Usuários existentes (white_glove) não são afetados — só o DEFAULT muda.
-- Maikon e Raul são travados explicitamente como white_glove como medida defensiva.

ALTER TABLE public.profiles
  ALTER COLUMN account_type SET DEFAULT 'self_serve';

-- Garante que usuários existentes de operação white_glove não mudem
UPDATE public.profiles p
  SET account_type = 'white_glove'
  WHERE p.user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('maikon@madeira.com.br', 'raul.sxs27@gmail.com', 'raul@trendpulse.app')
  )
  AND p.account_type = 'white_glove';

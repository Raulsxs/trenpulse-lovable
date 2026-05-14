-- Fase 3: Sistema de créditos para self_serve.
-- credits_balance em public.profiles (não auth.users — Supabase não recomenda
-- ALTER direto na tabela auth; profiles já é o padrão do projeto).

-- 1. Saldo de créditos no perfil
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 10;

-- 2. Histórico de transações
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta               INTEGER     NOT NULL,  -- positivo = crédito, negativo = débito
  reason              TEXT        NOT NULL
    CHECK (reason IN ('generation', 'monthly_reset', 'purchase', 'manual_adjustment')),
  template_id         UUID        REFERENCES public.templates(id)           ON DELETE SET NULL,
  generated_content_id UUID       REFERENCES public.generated_contents(id)  ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas as suas transações
DO $$ BEGIN
  CREATE POLICY "credit_transactions_select_own" ON public.credit_transactions
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Apenas service_role insere (via edge functions)
DO $$ BEGIN
  CREATE POLICY "credit_transactions_insert_service" ON public.credit_transactions
    FOR INSERT TO service_role
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user
  ON public.credit_transactions(user_id, created_at DESC);

-- 3. RPC atômica de débito
-- FOR UPDATE trava a linha e evita race condition em gerações paralelas.
CREATE OR REPLACE FUNCTION public.debit_credits(
  p_user_id    UUID,
  p_amount     INT,
  p_template_id UUID DEFAULT NULL,
  p_content_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance     INT;
  v_new_balance INT;
BEGIN
  SELECT credits_balance INTO v_balance
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_credits',
      'balance', v_balance,
      'cost', p_amount
    );
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE public.profiles
    SET credits_balance = v_new_balance
    WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, delta, reason, template_id, generated_content_id)
    VALUES (p_user_id, -p_amount, 'generation', p_template_id, p_content_id);

  RETURN jsonb_build_object('ok', true, 'balance', v_new_balance);
END;
$$;

-- 4. Função de reset mensal (chamada pelo cron via credits-monthly-reset)
CREATE OR REPLACE FUNCTION public.reset_monthly_credits(p_reset_amount INT DEFAULT 10)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Apenas self_serve; white_glove não usa créditos
  UPDATE public.profiles
    SET credits_balance = p_reset_amount
    WHERE account_type = 'self_serve';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.credit_transactions (user_id, delta, reason)
    SELECT p.user_id, p_reset_amount, 'monthly_reset'
    FROM public.profiles p
    WHERE p.account_type = 'self_serve';

  RETURN v_count;
END;
$$;

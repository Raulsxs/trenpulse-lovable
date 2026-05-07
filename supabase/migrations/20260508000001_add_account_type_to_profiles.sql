-- Add account_type to public.profiles for white_glove (Maikon-era) vs self_serve (template-first) routing fork.
-- Default 'white_glove' so existentes preservam UI atual. Novos signups também white_glove até Fase 2 ficar pronta;
-- nessa altura, migration adicional flipa o default pra 'self_serve'.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'white_glove';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_account_type_check
    CHECK (account_type IN ('white_glove', 'self_serve'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_account_type
  ON public.profiles(account_type);

COMMENT ON COLUMN public.profiles.account_type IS
  'Routing fork: white_glove sees current UI (Maikon-era); self_serve sees template-first UI (new). Reflected to JWT app_metadata via trigger.';

-- Defensive: garante que Maikon e Raul (admin) ficam white_glove explicitamente
UPDATE public.profiles p
  SET account_type = 'white_glove'
  WHERE p.user_id IN (
    SELECT id FROM auth.users
    WHERE email IN ('maikon@madeira.com.br', 'raul.sxs27@gmail.com')
  );

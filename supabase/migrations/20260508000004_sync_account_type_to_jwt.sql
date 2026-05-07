-- Trigger que reflete public.profiles.account_type em auth.users.raw_app_meta_data.account_type.
-- Permite que o front-end leia direto do JWT (via app_metadata.account_type) sem round-trip ao DB.
-- Definer security: a função roda como definer pra ter permissão de UPDATE em auth.users.

CREATE OR REPLACE FUNCTION public.sync_account_type_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb) ||
      jsonb_build_object('account_type', NEW.account_type)
    WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_type ON public.profiles;
CREATE TRIGGER trg_sync_account_type
  AFTER INSERT OR UPDATE OF account_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_type_to_jwt();

-- Backfill: replica account_type atual de todos os profiles existentes pro JWT.
UPDATE auth.users u
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('account_type', p.account_type)
  FROM public.profiles p
  WHERE p.user_id = u.id;

COMMENT ON FUNCTION public.sync_account_type_to_jwt() IS
  'Espelha public.profiles.account_type em auth.users.raw_app_meta_data.account_type. Disparada em INSERT/UPDATE de account_type. Sessão precisa ser renovada (refresh token) para o JWT refletir mudança.';

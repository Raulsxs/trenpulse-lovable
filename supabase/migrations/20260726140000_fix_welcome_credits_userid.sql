-- BUG: grant_welcome_credits usava new.id (a PK própria do profile, um uuid aleatório) em vez de
-- new.user_id (o id do usuário em auth.users). Como profiles.id != profiles.user_id, o trigger
-- chamava grant_credits(<id aleatório>) → INSERT em user_credits violava a FK p/ auth.users →
-- o INSERT do profile inteiro fazia ROLLBACK. Resultado: NENHUM perfil novo conseguia ser criado
-- (cadastro de usuário novo quebrado desde que este trigger entrou). Correção: usar new.user_id.
CREATE OR REPLACE FUNCTION public.grant_welcome_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not exists (select 1 from public.credit_ledger where user_id = new.user_id and reason = 'welcome') then
    perform public.grant_credits(new.user_id, 50, 'welcome', null, '{"note":"welcome credits"}'::jsonb);
  end if;
  return new;
end; $function$;

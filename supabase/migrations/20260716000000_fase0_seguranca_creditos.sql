-- Fase 0 — Proteção de receita/dados (auditoria de segurança).
-- Corrige: credit_pricing/billing_events sem RLS; funções de crédito executáveis por anon/authenticated
-- (self-grant de crédito, drain de crédito alheio, vazamento de PII via get_cron_users_due).

-- ── credit_pricing: catálogo de preços — leitura p/ todos, escrita só service_role ──
ALTER TABLE public.credit_pricing ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "credit_pricing_read" ON public.credit_pricing FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- sem policy de escrita → INSERT/UPDATE/DELETE bloqueados p/ anon/authenticated (service_role bypassa RLS)

-- ── billing_events: idempotência de pagamento — só service_role ──
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
-- sem policy → nenhum acesso p/ anon/authenticated

-- ── Funções de crédito privilegiadas (só webhook/cron via service_role) ──
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text, jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_credits(integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cron_users_due() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debit_credits(uuid, integer, uuid, uuid) FROM anon, authenticated;

-- ── spend_credits: o agente chama via client do usuário (ctx.userClient), então NÃO revogamos de
-- authenticated. Mas o corpo não validava p_user → um usuário podia drenar crédito de outro.
-- Guard: usuário só gasta o PRÓPRIO crédito; service_role (auth.uid() null) passa livre. Anon nunca.
REVOKE EXECUTE ON FUNCTION public.spend_credits(uuid, integer, uuid, jsonb) FROM anon;

CREATE OR REPLACE FUNCTION public.spend_credits(p_user uuid, p_amount integer, p_generation_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare cur int; new_balance int;
begin
  -- um usuário só pode gastar OS PRÓPRIOS créditos; service_role (auth.uid() null) passa livre.
  if auth.uid() is not null and p_user <> auth.uid() then
    raise exception 'FORBIDDEN: cannot spend credits for another user';
  end if;
  insert into public.user_credits(user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select balance into cur from public.user_credits where user_id = p_user for update;
  if cur < p_amount then raise exception 'INSUFFICIENT_CREDITS: have %, need %', cur, p_amount; end if;
  update public.user_credits set balance = balance - p_amount, updated_at = now() where user_id = p_user returning balance into new_balance;
  insert into public.credit_ledger(user_id, amount, reason, generation_id, metadata) values (p_user, -p_amount, 'generation', p_generation_id, p_metadata);
  return new_balance;
end; $function$;

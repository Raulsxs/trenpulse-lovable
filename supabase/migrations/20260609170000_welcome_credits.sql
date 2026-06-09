-- Crédito de boas-vindas: todo novo usuário nasce com 50 créditos (~R$5) pra experimentar
-- (time-to-value). Idempotente. Dispara no insert do profile (criado no signup).
create or replace function public.grant_welcome_credits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.credit_ledger where user_id = new.id and reason = 'welcome') then
    perform public.grant_credits(new.id, 50, 'welcome', null, '{"note":"welcome credits"}'::jsonb);
  end if;
  return new;
end; $$;

drop trigger if exists trg_welcome_credits on public.profiles;
create trigger trg_welcome_credits
  after insert on public.profiles
  for each row execute function public.grant_welcome_credits();

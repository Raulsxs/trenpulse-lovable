-- Sistema de créditos prepagos (carteira). White-glove é o padrão; billing = créditos puros.
-- 1 crédito ~= R$0,10 (retail). Markup ~3x embutido no preço do crédito. Ledger = fonte de verdade.

-- Saldo (lockable) por usuário
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

-- Ledger append-only (auditável). Nunca dar UPDATE — só INSERT.
create table if not exists public.credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,                 -- +grant / -spend
  reason text not null,                    -- 'purchase'|'generation'|'refund'|'reversal'|'seed'|'promo'
  generation_id uuid,
  payment_ref text,                        -- asaas payment id (compras)
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

-- Idempotência de webhooks de pagamento
create table if not exists public.billing_events (
  event_id text primary key,
  provider text not null default 'asaas',
  created_at timestamptz not null default now()
);

-- Preço por ação (créditos). Ajustável sem deploy.
create table if not exists public.credit_pricing (
  action text primary key,
  credits integer not null,
  description text
);

-- RLS: dono lê seu saldo e seu ledger. Escrita só via funções (security definer) / service role.
alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;
drop policy if exists "own credits" on public.user_credits;
create policy "own credits" on public.user_credits for select using (auth.uid() = user_id);
drop policy if exists "own ledger" on public.credit_ledger;
create policy "own ledger" on public.credit_ledger for select using (auth.uid() = user_id);

-- Conceder créditos (compra / seed / estorno)
create or replace function public.grant_credits(p_user uuid, p_amount int, p_reason text, p_payment_ref text default null, p_metadata jsonb default null)
returns integer language plpgsql security definer set search_path = public as $$
declare new_balance int;
begin
  insert into public.user_credits(user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  update public.user_credits set balance = balance + p_amount, updated_at = now() where user_id = p_user returning balance into new_balance;
  insert into public.credit_ledger(user_id, amount, reason, payment_ref, metadata) values (p_user, p_amount, p_reason, p_payment_ref, p_metadata);
  return new_balance;
end; $$;

-- Gastar créditos (geração) — atômico, race-safe (FOR UPDATE)
create or replace function public.spend_credits(p_user uuid, p_amount int, p_generation_id uuid default null, p_metadata jsonb default null)
returns integer language plpgsql security definer set search_path = public as $$
declare cur int; new_balance int;
begin
  insert into public.user_credits(user_id, balance) values (p_user, 0) on conflict (user_id) do nothing;
  select balance into cur from public.user_credits where user_id = p_user for update;
  if cur < p_amount then raise exception 'INSUFFICIENT_CREDITS: have %, need %', cur, p_amount; end if;
  update public.user_credits set balance = balance - p_amount, updated_at = now() where user_id = p_user returning balance into new_balance;
  insert into public.credit_ledger(user_id, amount, reason, generation_id, metadata) values (p_user, -p_amount, 'generation', p_generation_id, p_metadata);
  return new_balance;
end; $$;

-- Seed de preços (créditos por ação)
insert into public.credit_pricing(action, credits, description) values
  ('post', 4, 'Post com imagem (gpt-image-2 medium)'),
  ('carousel_slide', 4, 'Por slide de carrossel'),
  ('story', 6, 'Story 9:16 (Nano Banana Pro)'),
  ('tweet_card', 2, 'Carrossel de tweet card'),
  ('free_image', 4, 'Imagem livre (geração crua)'),
  ('premium_image', 24, 'Imagem premium (Nano Banana Pro)'),
  ('caption', 0, 'Legenda (incluída na geração)')
on conflict (action) do nothing;

-- Seed Maikon: cliente white-glove nasce com ~$20 (~R$108 ~ 1080 créditos). Idempotente.
do $$
begin
  if not exists (select 1 from public.credit_ledger where user_id = '58a0c7ec-faf7-4b70-91cd-ce335100f66f' and reason = 'seed') then
    perform public.grant_credits('58a0c7ec-faf7-4b70-91cd-ce335100f66f', 1080, 'seed', null, '{"note":"white-glove welcome ~$20"}'::jsonb);
  end if;
end $$;

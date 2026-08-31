-- Assinaturas de crédito (recorrência mensal via Asaas).
--
-- POR QUE UMA TABELA NOVA, e não user_subscriptions: aquela tabela é do modelo antigo de PLANOS
-- (Free/Pro/Business com limite de gerações), que morreu quando o billing virou carteira de
-- créditos pré-pagos. Aqui a assinatura não dá "acesso" a nada — ela só DEPOSITA créditos todo
-- mês. Misturar os dois conceitos na mesma tabela é o que faria alguém, daqui a seis meses, achar
-- que assinatura destrava feature.
--
-- O CRÉDITO NÃO CAI AQUI. Quem credita é o asaas-webhook, por PAGAMENTO recebido: o Asaas gera uma
-- cobrança nova a cada ciclo, com id próprio, e o índice único de credit_ledger(payment_ref) já
-- protege contra crédito em dobro. Esta tabela é só o espelho do estado da assinatura, pra UI
-- saber o que mostrar e pra dar onde cancelar.

create table if not exists public.credit_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- id da assinatura no Asaas (sub_xxx). Único: uma linha por assinatura lá.
  asaas_subscription_id text not null unique,
  plan_id text not null,                       -- "mensal-100" | "mensal-200" | "mensal-400"
  value_brl numeric(10,2) not null,
  credits_per_cycle integer not null,          -- já inclui o bônus de recorrência
  status text not null default 'active'
    check (status in ('active', 'canceled', 'overdue')),
  next_due_date date,
  created_at timestamptz not null default now(),
  canceled_at timestamptz
);

-- Uma assinatura ATIVA por usuário. Índice parcial: canceladas podem se acumular no histórico,
-- mas ninguém fica pagando dois planos ao mesmo tempo por causa de duplo clique no botão.
create unique index if not exists credit_subscriptions_one_active
  on public.credit_subscriptions (user_id) where status = 'active';

create index if not exists credit_subscriptions_user_idx
  on public.credit_subscriptions (user_id, created_at desc);

-- RLS: o dono LÊ a própria assinatura (a UI precisa saber que existe e quando renova).
-- Escrita é só service_role — quem cria/cancela é edge function, nunca o cliente.
alter table public.credit_subscriptions enable row level security;
drop policy if exists "own subscription" on public.credit_subscriptions;
create policy "own subscription" on public.credit_subscriptions
  for select using (auth.uid() = user_id);

revoke all on public.credit_subscriptions from anon, authenticated;
grant select on public.credit_subscriptions to authenticated;

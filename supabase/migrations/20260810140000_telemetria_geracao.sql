-- Telemetria de geração — o que faz um incidente ser diagnosticável DEPOIS do fato.
--
-- PROBLEMA QUE RESOLVE: hoje só existe console.log, e os logs do Supabase têm retenção curta demais.
-- Ao investigar por que uma geração levava 85s, os logs daquela execução já não existiam. Sem isso,
-- toda falha é descoberta por reclamação de usuário, e toda decisão de infra é tomada por sensação.
--
-- As perguntas que esta tabela passa a responder, e que hoje não têm resposta:
--   - Estamos batendo em rate limit (429) do provedor?  → status_code
--   - Qual a margem REAL por peça?                       → cost_usd vs créditos cobrados
--   - Qual modelo é mais rápido de verdade?              → duration_ms por modelo (p50/p95)
--   - O que quebrou ontem à noite?                       → error, com a janela inteira preservada
--
-- CUSTO NO CAMINHO QUENTE: zero. A escrita é fire-and-forget (o chamador não espera nem trata erro);
-- se a telemetria falhar, a geração segue normalmente. Nunca deve derrubar uma geração.

create table if not exists public.generation_telemetry (
  id           bigint generated always as identity primary key,
  created_at   timestamptz not null default now(),
  user_id      uuid references auth.users(id) on delete set null,
  content_id   uuid,                 -- sem FK: a telemetria sobrevive à exclusão do conteúdo
  job_id       uuid,                 -- quando veio da fila
  kind         text not null,        -- 'image' | 'text'
  action       text,                 -- post | carousel_slide | story | caption | structure...
  provider     text,                 -- 'openrouter' | 'replicate' | 'inference'
  model        text,
  duration_ms  integer,
  cost_usd     numeric(10, 6),       -- usage.cost do OpenRouter, quando disponível
  status       text not null,        -- 'ok' | 'error'
  status_code  integer,              -- HTTP do provedor: é aqui que um 429 aparece
  error        text,
  attempt      smallint default 1,   -- >1 = precisou de retry (mede instabilidade do provedor)
  metadata     jsonb
);

-- Índices pensados nas consultas reais: "últimas 24h", "por modelo", "erros recentes".
create index if not exists gen_telemetry_time_idx   on public.generation_telemetry(created_at desc);
create index if not exists gen_telemetry_model_idx  on public.generation_telemetry(model, created_at desc);
create index if not exists gen_telemetry_status_idx on public.generation_telemetry(status, created_at desc) where status <> 'ok';
create index if not exists gen_telemetry_user_idx   on public.generation_telemetry(user_id, created_at desc);

-- RLS ligada, ZERO policies: dado operacional, só service_role escreve e lê (mesmo padrão de
-- billing_events e das tabelas de cupom). O usuário não tem por que ver latência e custo de provedor.
alter table public.generation_telemetry enable row level security;
revoke all on public.generation_telemetry from anon, authenticated;

-- ── Painel operacional ───────────────────────────────────────────────────────────────────────────
-- Por dia e modelo: volume, latência (p50 e p95, porque a média esconde a cauda que o usuário sente),
-- custo e taxa de erro.
create or replace view public.telemetria_diaria
with (security_invoker = on) as
select
  created_at::date                                                       as dia,
  kind,
  model,
  count(*)                                                               as chamadas,
  count(*) filter (where status = 'ok')                                  as ok,
  count(*) filter (where status <> 'ok')                                 as erros,
  count(*) filter (where status_code = 429)                              as rate_limited,
  count(*) filter (where attempt > 1)                                    as precisaram_retry,
  round(percentile_cont(0.5) within group (order by duration_ms))        as p50_ms,
  round(percentile_cont(0.95) within group (order by duration_ms))       as p95_ms,
  round(sum(cost_usd), 4)                                                as custo_usd
from public.generation_telemetry
group by 1, 2, 3;

revoke all on public.telemetria_diaria from anon, authenticated;

-- ── Margem real ──────────────────────────────────────────────────────────────────────────────────
-- Cruza o custo de provedor com os créditos efetivamente cobrados pela mesma peça. É a resposta para
-- "quanto sobra", que hoje é estimativa. 1 crédito = R$0,10; USD→BRL entra como parâmetro porque a
-- cotação muda (default 5.40, ajustar quando desviar muito).
create or replace function public.margem_real(p_usd_brl numeric default 5.40, p_dias integer default 30)
returns table(
  dia date, pecas bigint, custo_brl numeric, receita_brl numeric, margem_brl numeric, margem_pct numeric
)
language sql
stable
as $$
  with t as (
    select created_at::date as dia, content_id, sum(cost_usd) as usd
    from public.generation_telemetry
    where status = 'ok' and cost_usd is not null
      and created_at > now() - (p_dias || ' days')::interval
    group by 1, 2
  ),
  c as (
    select generation_id as content_id, sum(-amount) as creditos
    from public.credit_ledger
    where amount < 0 and generation_id is not null
    group by 1
  )
  select
    t.dia,
    count(*)                                              as pecas,
    round(sum(t.usd * p_usd_brl), 2)                      as custo_brl,
    round(sum(coalesce(c.creditos, 0) * 0.10), 2)         as receita_brl,
    round(sum(coalesce(c.creditos, 0) * 0.10 - t.usd * p_usd_brl), 2) as margem_brl,
    round(100 * (sum(coalesce(c.creditos, 0) * 0.10 - t.usd * p_usd_brl))
          / nullif(sum(coalesce(c.creditos, 0) * 0.10), 0), 1)        as margem_pct
  from t left join c on c.content_id = t.content_id
  group by 1 order by 1 desc;
$$;

revoke all on function public.margem_real(numeric, integer) from public;
grant execute on function public.margem_real(numeric, integer) to service_role;

-- Inteligência do agente: medir qualidade por SINAL DE COMPORTAMENTO, não por pesquisa de satisfação.
--
-- POR QUE ASSIM: pedir nota ao usuário tem viés (quem responde é quem está muito satisfeito ou muito
-- irritado) e atrito. O comportamento não mente: se a pessoa PUBLICOU, a peça serviu; se gerou de novo
-- em 2 minutos, a primeira não serviu; se nunca mais tocou, abandonou.
--
-- LINHA DE BASE medida em 2026-08-10, antes de qualquer melhoria (467 gerações, 90 dias):
--   publicadas ............. 25,9%
--   retrabalho (nova geração em <10min) ... 42,8%
-- Ou seja: 3 de cada 4 peças não são publicadas, e em quase metade das vezes a primeira tentativa
-- não serviu. É contra estes números que qualquer melhoria de qualidade deve ser comparada.

-- ── Vínculo conversa ↔ conteúdo ──────────────────────────────────────────────────────────────────
-- Sem isto só dá pra correlacionar por proximidade de tempo, que confunde quem gera duas coisas
-- seguidas. Com o content_id, dá pra perguntar "o que o usuário PEDIU na peça que ele abandonou?",
-- que é a pergunta que ensina o agente a errar menos.
alter table public.agent_message_log add column if not exists content_id uuid;
create index if not exists agent_message_log_content_idx on public.agent_message_log(content_id) where content_id is not null;

-- ── Métricas de qualidade ────────────────────────────────────────────────────────────────────────
-- security_invoker: a view respeita a RLS de quem consulta. Sem isso viraria vazamento de dados
-- entre usuários (o mesmo erro que a coupon_campaign_stats evita).
create or replace view public.agent_quality_metrics
with (security_invoker = on) as
with g as (
  select
    id, user_id, content_type, platform, created_at, published_at, status,
    -- Próxima geração do MESMO usuário: se veio logo em seguida, a anterior provavelmente não serviu.
    lead(created_at) over (partition by user_id order by created_at) as next_at
  from public.generated_contents
)
select
  date_trunc('week', created_at)::date                                as semana,
  content_type,
  count(*)                                                            as geradas,
  count(*) filter (where published_at is not null)                    as publicadas,
  round(100.0 * count(*) filter (where published_at is not null) / nullif(count(*), 0), 1) as pct_publicadas,
  -- Proxy de retrabalho: nova geração em menos de 10 minutos.
  count(*) filter (where next_at is not null and next_at - created_at < interval '10 minutes') as com_retrabalho,
  round(100.0 * count(*) filter (where next_at is not null and next_at - created_at < interval '10 minutes')
        / nullif(count(*), 0), 1)                                     as pct_retrabalho,
  -- Abandono: nunca publicada e sem nova tentativa em seguida (a pessoa simplesmente desistiu).
  count(*) filter (where published_at is null
                     and (next_at is null or next_at - created_at >= interval '10 minutes')) as abandonadas
from g
group by 1, 2;

revoke all on public.agent_quality_metrics from anon;

-- ── Casos ruins, para o agente aprender ──────────────────────────────────────────────────────────
-- Alimenta a autoanálise: as peças que o usuário NÃO quis, com o que ele pediu logo depois (que é a
-- correção implícita). Sem isso, "melhorar o agente" vira palpite.
create or replace view public.agent_failure_cases
with (security_invoker = on) as
select
  c.id            as content_id,
  c.user_id,
  c.content_type,
  c.platform,
  c.title,
  c.created_at,
  -- O que o usuário disse DEPOIS de receber a peça: é aqui que mora a correção.
  (select m.content
     from public.agent_message_log m
    where m.user_id = c.user_id
      and m.role = 'user'
      and m.created_at between c.created_at and c.created_at + interval '15 minutes'
    order by m.created_at
    limit 1)      as pedido_seguinte
from public.generated_contents c
where c.published_at is null          -- não serviu
  and c.status <> 'processing';       -- e não é só uma geração ainda em curso

revoke all on public.agent_failure_cases from anon;

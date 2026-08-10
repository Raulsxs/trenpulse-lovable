-- Rede de segurança da fila de gerações + reconciliação de estado preso.
--
-- O QUE ESTAVA ERRADO: o worker `process-generation-jobs` só rodava quando o FRONT dava o "kick".
-- Se o usuário fechasse a aba, ou o worker morresse no wall-clock, o job ficava em `processing` para
-- sempre. O comentário do worker dizia que o cron era a rede de segurança, mas o cron **nunca
-- existiu** — o único agendado era o `publish-scheduled-content`. Verificado em produção 2026-08-10.
--
-- Sintoma real observado: 6 conteúdos presos em `processing`, o mais antigo há 1 mês e 18 dias, de um
-- cliente pagante. As peças tinham TODAS as imagens geradas: o trabalho foi feito e cobrado, só o
-- estado não fechou. Para o usuário, isso é "gerando…" que nunca termina.

-- ── 0. Autenticação do cron: TOKEN DEDICADO, guardado no Vault ───────────────────────────────────
-- Por que não a service key:
--   1. PRIVILÉGIO MÍNIMO. Este token só serve pra disparar o worker; a service key abriria o banco
--      inteiro caso vazasse.
--   2. Não daria mesmo. A `SUPABASE_SERVICE_ROLE_KEY` que a edge function recebe é um secret próprio
--      do projeto, com digest diferente das chaves da API (legacy e sb_secret) — verificado. O cron
--      não teria como reproduzi-la.
-- O worker passou a aceitar `CRON_SECRET` como chamador interno (process-generation-jobs/index.ts).
--
-- PRÉ-REQUISITOS MANUAIS (uma vez, fora do git):
--   supabase secrets set CRON_SECRET=<token>
--   select vault.create_secret('<token>', 'cron_worker_token', 'Token do pg_cron para o worker');
--
-- Nota sobre exposição: `has_table_privilege` sugere que anon lê `cron.job`, mas na prática o acesso
-- ao SCHEMA cron já é negado antes ("permission denied for schema cron", testado com SET ROLE).
-- O revoke abaixo é defesa em profundidade, não correção de brecha.
revoke select on cron.job              from public;
revoke select on cron.job_run_details  from public;

-- ── 1. Cron do worker ────────────────────────────────────────────────────────────────────────────
-- A cada 3 minutos varre quem tem job na fila. É idempotente (claim_next_job trava a linha
-- atomicamente e recupera órfãos), então rodar junto com um kick do front é seguro.
select cron.schedule(
  'process-generation-jobs',
  '*/3 * * * *',
  $$
  select net.http_post(
    url     := 'https://qdmhqxpazffmaxleyzxs.supabase.co/functions/v1/process-generation-jobs',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_worker_token')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- ── 2. Reconciliação de conteúdo preso ───────────────────────────────────────────────────────────
-- O `processing` do generated_contents não tinha ninguém para fechá-lo. Esta função separa os dois
-- desfechos, que exigem tratamento diferente:
--   - TEM imagem  → o trabalho saiu, só o estado não fechou. Vira 'draft' (o usuário recebe).
--   - SEM imagem  → falhou de verdade. Vira 'rejected'; o crédito cobrado precisa de estorno manual.
create or replace function public.reconciliar_conteudo_preso()
returns table(id uuid, desfecho text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with presos as (
    select c.id, coalesce(array_length(c.image_urls, 1), 0) as imgs
    from public.generated_contents c
    where c.status = 'processing'
      and c.created_at < now() - interval '20 minutes'
  ),
  entregues as (
    update public.generated_contents c set status = 'draft'
    from presos p where p.id = c.id and p.imgs > 0
    returning c.id
  ),
  falhos as (
    update public.generated_contents c set status = 'rejected'
    from presos p where p.id = c.id and p.imgs = 0
    returning c.id
  )
  select e.id, 'entregue'::text from entregues e
  union all
  select f.id, 'falhou'::text from falhos f;
end;
$$;

revoke all on function public.reconciliar_conteudo_preso() from public;
grant execute on function public.reconciliar_conteudo_preso() to service_role;

select cron.schedule('reconciliar-conteudo-preso', '*/10 * * * *',
  $$ select public.reconciliar_conteudo_preso(); $$);

-- ── 3. Publicação presa ──────────────────────────────────────────────────────────────────────────
-- O scheduler trava a linha em 'publishing' antes de publicar (lock correto, evita post duplicado),
-- mas nada reverte se a função morre no meio. O cron filtra 'scheduled' e a reconciliação do PFM
-- filtra 'processing': ninguém olha 'publishing'. Resultado: o agendamento nunca sai, sem erro.
-- 30 min é folgado de propósito — publicar um story carousel pode levar minutos.
create or replace function public.reconciliar_publicacao_presa()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.generated_contents
     set status = 'scheduled'          -- devolve pra fila: o scheduler tenta de novo
   where status = 'publishing'
     and scheduled_at < now() - interval '30 minutes';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.reconciliar_publicacao_presa() from public;
grant execute on function public.reconciliar_publicacao_presa() to service_role;

select cron.schedule('reconciliar-publicacao-presa', '*/15 * * * *',
  $$ select public.reconciliar_publicacao_presa(); $$);

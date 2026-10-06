-- Recorrentes: perfil de destino e erro visível. Reconciliador: para de rebaixar publicação pendente.
--
-- ── 1. recurring_schedules.account_ids / last_error ─────────────────────────────────────────────
-- O recorrente só guardava a REDE. Ao disparar, o agendador criava a cópia sem conta nenhuma e o
-- publicador caía no legado (`connections.find(c => c.platform === tp)`): a PRIMEIRA conta daquela
-- rede. Quem tem três Instagram publicava num perfil sorteado. E quando a rede não tinha conta, a
-- cópia falhava três vezes e morria em silêncio — caso real: um recorrente de Facebook de um usuário
-- sem Facebook falhou em 14/09, 21/09, 22/09, 24/09, 02/10, 04/10 e 05/10 sem ninguém ser avisado.
--
-- account_ids: os perfis escolhidos (ids do Post for Me). NULL = recorrente antigo, segue pela rede.
-- last_error: o que o agendador achou de errado na última vez; a tela e o listar_agenda mostram.
alter table public.recurring_schedules
  add column if not exists account_ids text[],
  add column if not exists last_error text;

comment on column public.recurring_schedules.account_ids is
  'Perfis de destino (ids do Post for Me). NULL = recorrente antigo: usa a primeira rede de platforms.';
comment on column public.recurring_schedules.last_error is
  'Problema encontrado no último disparo (rede sem conta, perfil ambíguo). NULL = tudo certo.';

-- ── 2. reconciliar_conteudo_preso: `processing` tem DOIS significados ─────────────────────────────
-- Este cron existe para a GERAÇÃO que travou: peça em `processing` há mais de 20 min vira `draft`
-- (se tem imagem) ou `rejected`. Só que o publicador usa o MESMO status para outra coisa: publicação
-- que o Post for Me aceitou e ainda não confirmou (com `generation_metadata.pfm_pending`).
--
-- Resultado: toda publicação pendente por mais de 20 min era rebaixada para `draft`. E `draft` com
-- data marcada não aparece no calendário nem volta a ser conferida pelo agendador — o post podia ter
-- saído na rede e o app dizia rascunho. Em 2026-10-06 havia 71 peças assim, de 4 usuários, desde maio.
--
-- Agora o cron só toca no que é geração: sem pendência de publicação, sem data de publicação.
create or replace function public.reconciliar_conteudo_preso()
 returns table(id uuid, desfecho text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  return query
  with presos as (
    select c.id, coalesce(array_length(c.image_urls, 1), 0) as imgs
    from public.generated_contents c
    where c.status = 'processing'
      and c.created_at < now() - interval '20 minutes'
      -- Publicação aguardando o Post for Me NÃO é geração travada: quem resolve é o agendador,
      -- que reconsulta o Post for Me e marca published ou failed.
      and not (coalesce(c.generation_metadata, '{}'::jsonb) ? 'pfm_pending')
      and c.published_at is null
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
$function$;

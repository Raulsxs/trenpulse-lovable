-- Sessões de serviço — a sessão de usuário que o MCP e o worker da fila REUSAM, em vez de abrir uma
-- nova a cada chamada.
--
-- POR QUE EXISTE: para agir COMO o usuário (RLS ativa), o MCP e o worker da fila trocavam PAT/user_id
-- por JWT via admin/generate_link + /verify. Cada troca é um LOGIN NOVO. O cache ficava na memória do
-- isolate, e cada chamada cai num isolate diferente — então o cache nunca acertava. Medido em
-- 2026-09-13: 8 sessões de login abertas em 15 segundos para 2 scripts de teste.
--
-- Três consequências, todas reais:
--   1. Cada chamada pagava duas idas HTTP extras (~1,5 s de uma leitura de saldo de ~2 s).
--   2. `/verify` tem rate limit de 30 por 5 min, e as edge functions saem por IPs compartilhados —
--      um agente agendando 16 artes, somado a outro cliente, bateria no limite e passaria a receber
--      "Não consegui abrir sessão".
--   3. `last_sign_in_at` era sobrescrito a cada chamada, inflando a métrica de usuários ativos.
--
-- Agora: uma sessão por usuário, guardada aqui, renovada pelo refresh_token (que NÃO abre sessão
-- nova e tem limite de 150). O login por magic link só acontece na primeira vez ou se o refresh for
-- recusado.
--
-- ⚠️ ESTA TABELA GUARDA REFRESH TOKENS, que valem uma sessão. Por isso: RLS ligada, NENHUMA policy,
-- e sem grant para anon/authenticated. Só a service role lê — que é o mesmo nível de confiança da
-- própria service key, que já consegue abrir sessão para qualquer usuário.

create table if not exists public.sessoes_servico (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expira_em timestamptz not null,
  atualizada_em timestamptz not null default now()
);

alter table public.sessoes_servico enable row level security;
-- Sem policies de propósito: nenhum cliente, nem o próprio dono, lê refresh token por aqui.
revoke all on public.sessoes_servico from anon, authenticated;

comment on table public.sessoes_servico is
  'Sessão reutilizável por usuário para MCP e worker da fila. Só service role. Ver migration 20260913120000.';

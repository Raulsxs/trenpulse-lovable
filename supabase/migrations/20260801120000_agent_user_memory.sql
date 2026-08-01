-- T10 (Memória viva do agente) — destilado de preferências duráveis do usuário.
--
-- POR QUE: agent_message_log guarda todo turno mas nunca era lido. As mensagens cruas são quase
-- sempre TEMAS one-off ("cria carrossel sobre X") — poluir o prompt com elas não ajuda. O sinal útil
-- é o PADRÃO recorrente (formato/rede/tom preferidos, correções que se repetem). Esta tabela guarda um
-- resumo DESTILADO (por LLM barato, raramente) que o system prompt do ai-agent injeta a cada turno.
--
-- Um registro por usuário. Escrita só via service_role (o ai-agent destila fora do caminho quente);
-- o usuário lê o próprio (transparência). message_count marca em que tamanho de log foi destilado
-- por último — a destilação só re-roda quando o log cresce o suficiente (evita custo por turno).
create table if not exists public.agent_user_memory (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  summary       text        not null default '',
  message_count integer     not null default 0,
  distilled_at  timestamptz not null default now()
);

alter table public.agent_user_memory enable row level security;

-- Usuário lê a própria memória; ninguém escreve via RLS (só service_role, que ignora RLS).
drop policy if exists "own read agent memory" on public.agent_user_memory;
create policy "own read agent memory"
  on public.agent_user_memory for select
  using (auth.uid() = user_id);

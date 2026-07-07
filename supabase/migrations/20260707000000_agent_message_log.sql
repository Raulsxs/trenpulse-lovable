-- Auditoria do /agent: hoje a conversa vive só no localStorage do navegador do usuário.
-- Esta tabela persiste cada turno (mensagem do usuário + resposta do assistente + tool calls)
-- pra o dono auditar o que os clientes em teste (ex.: Maikon) fazem no agente.
create table if not exists public.agent_message_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role text not null,                 -- 'user' | 'assistant'
  content text,                       -- texto da mensagem / resposta
  tool_calls jsonb,                   -- [{name, input}] quando o assistente chama ferramentas
  image_count int not null default 0, -- nº de imagens anexadas (turno do usuário)
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_log_user_time
  on public.agent_message_log (user_id, created_at desc);

-- Escrita é sempre via service_role (edge function ai-agent), que ignora RLS.
-- Leitura: o próprio usuário vê os seus; auditoria do dono é via service_role.
alter table public.agent_message_log enable row level security;
create policy "agent_log_own_select" on public.agent_message_log
  for select using (auth.uid() = user_id);

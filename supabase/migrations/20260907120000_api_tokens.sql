-- Personal Access Tokens — credencial de longa duração para o MCP do TrendPulse.
--
-- POR QUE EXISTE: toda edge function hoje exige JWT de sessão do Supabase, que expira e não é
-- revogável por aplicação. Um servidor MCP rodando no Claude/Codex do usuário precisa de uma
-- credencial que dure, que ele possa revogar sozinho, e cujo alcance seja limitado.
--
-- Arquitetura completa em docs/arquitetura/mcp-trendpulse.md.

-- pgcrypto vive no schema `extensions` no Supabase, NAO em public. Como as funcoes abaixo sao
-- security definer com search_path fixo (obrigatorio: search_path mutavel em security definer e
-- vetor de escalonamento), digest/gen_random_bytes precisam vir QUALIFICADOS. Sem isso a
-- verificacao morre com "function digest(text, unknown) does not exist" — e um token valido
-- passaria a ser recusado em producao.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- NUNCA o token cru. Só o SHA-256 dele: vazamento do banco não vira acesso às contas.
  token_hash text not null unique,
  -- Primeiros caracteres, só pra pessoa reconhecer qual token é na lista ("tp_pat_a3f2…").
  prefixo text not null,
  name text not null,
  -- ESCOPOS DESDE O COMEÇO, não depois. `publish` fica fora do padrão de propósito: publicar sem
  -- revisão é o oposto do que o usuário pediu ("queria aprovar a semana"), e um token vazado com
  -- publish posta no perfil de um médico.
  scopes text[] not null default array['read']::text[],
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint api_tokens_scopes_validos check (
    scopes <@ array['read', 'schedule', 'generate', 'publish']::text[] and array_length(scopes, 1) >= 1
  )
);

create index if not exists api_tokens_user_idx on public.api_tokens (user_id, created_at desc);
-- Busca do caminho quente: verificação por hash, só entre os vivos.
create index if not exists api_tokens_hash_ativo_idx on public.api_tokens (token_hash) where revoked_at is null;

-- RLS: o dono LÊ e REVOGA os próprios tokens (a UI precisa listar e apagar).
-- Criar é só por RPC security definer — senão o cliente escolheria o próprio hash.
alter table public.api_tokens enable row level security;
drop policy if exists "own tokens read" on public.api_tokens;
create policy "own tokens read" on public.api_tokens for select using (auth.uid() = user_id);
drop policy if exists "own tokens revoke" on public.api_tokens;
create policy "own tokens revoke" on public.api_tokens for update using (auth.uid() = user_id);

revoke all on public.api_tokens from anon, authenticated;
grant select, update on public.api_tokens to authenticated;

-- ── Criação ────────────────────────────────────────────────────────────────
-- Devolve o token CRU uma única vez. Depois disso ele não existe em lugar nenhum além da máquina
-- do usuário: o banco só guarda o hash.
create or replace function public.create_api_token(p_name text, p_scopes text[] default array['read']::text[], p_expires_at timestamptz default null)
returns table (id uuid, token text, prefixo text)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_raw text;
  v_id uuid;
begin
  if v_user is null then raise exception 'NAO_AUTENTICADO'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'NOME_OBRIGATORIO'; end if;

  -- gen_random_bytes (pgcrypto), NUNCA random(): random() não é criptográfico e um token
  -- adivinhável aqui vale acesso à conta inteira.
  v_raw := 'tp_pat_' || encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.api_tokens (user_id, token_hash, prefixo, name, scopes, expires_at)
  values (v_user, encode(extensions.digest(v_raw, 'sha256'), 'hex'), left(v_raw, 15), trim(p_name), p_scopes, p_expires_at)
  returning public.api_tokens.id into v_id;

  return query select v_id, v_raw, left(v_raw, 15);
end; $$;

revoke all on function public.create_api_token(text, text[], timestamptz) from public, anon;
grant execute on function public.create_api_token(text, text[], timestamptz) to authenticated;

-- ── Verificação ────────────────────────────────────────────────────────────
-- Chamada pelas edge functions com service_role. Recebe o token CRU, devolve dono e escopos.
-- Linha inválida/revogada/expirada devolve vazio — quem chama trata como 401.
create or replace function public.verify_api_token(p_token text)
returns table (user_id uuid, scopes text[])
language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  if p_token is null or p_token = '' then return; end if;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- last_used_at é o que permite achar token esquecido e revogar com confiança.
  update public.api_tokens t set last_used_at = now()
  where t.token_hash = v_hash and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > now());

  return query
    select t.user_id, t.scopes from public.api_tokens t
    where t.token_hash = v_hash and t.revoked_at is null
      and (t.expires_at is null or t.expires_at > now());
end; $$;

revoke all on function public.verify_api_token(text) from public, anon, authenticated;

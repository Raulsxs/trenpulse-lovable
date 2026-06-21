-- Realtime no saldo de créditos: sem a tabela na publication, o front (useCredits) não recebe
-- os UPDATEs de débito/crédito e o saldo só muda no refresh da página. A policy de SELECT
-- "own credits" (migration 20260609120000) já restringe o realtime à própria linha do usuário.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_credits'
  ) then
    alter publication supabase_realtime add table public.user_credits;
  end if;
end $$;

-- REPLICA IDENTITY FULL: garante que o payload do realtime traga a linha completa (balance + user_id)
-- de forma estável em UPDATEs.
alter table public.user_credits replica identity full;

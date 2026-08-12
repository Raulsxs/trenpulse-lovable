-- Cria o profile (e, por tabela, os créditos de boas-vindas) no CADASTRO, não no meio do onboarding.
--
-- PROBLEMA: não existia nenhum trigger em auth.users. Quem inseria a linha em public.profiles era o
-- front, no ChatWindow.tsx:539, lá no passo de onboarding do chat. Como grant_welcome_credits()
-- dispara em INSERT de profiles, o efeito era: quem criava a conta e parava antes de terminar o
-- onboarding ficava sem profile E sem os 50 créditos, para sempre.
--
-- Medido antes desta migration: 15 usuários, 11 profiles, 3 com welcome credits. Não é caso de
-- borda — é o caminho comum de quem cria conta e vai olhar depois.
--
-- Isto vira bloqueador com o login via Google: OAuth remove o atrito do cadastro, então esse
-- caminho passa a ser o mais percorrido, e o trigger em auth.users cobre TODO provedor de uma vez
-- (email, Google, o que vier), em vez de cada tela do front lembrar de criar o profile.

-- ── 1. O trigger ────────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- NUNCA derrubar o cadastro por causa de um efeito colateral nosso.
  --
  -- Este bloco de exceção não é decoração: um trigger em auth.users roda DENTRO da transação do
  -- INSERT do usuário. Se ele levantar, o usuário não é criado e o cadastro falha inteiro, sem o
  -- Supabase dizer o porquê. Já aconteceu neste projeto — ver
  -- 20260726140000_fix_welcome_credits_userid.sql, onde uma FK violada dentro do trigger de
  -- créditos quebrou TODO cadastro novo. Perder o profile é recuperável (backfill); perder o
  -- cadastro é perder o usuário.
  begin
    insert into public.profiles (user_id, full_name)
    values (
      new.id,
      -- Cada provedor nomeia isto de um jeito: senha manda "name" (options.data do signUp),
      -- Google manda "full_name" e "name". Sem nada, o começo do email já é melhor que NULL.
      nullif(trim(coalesce(
        new.raw_user_meta_data ->> 'name',
        new.raw_user_meta_data ->> 'full_name',
        split_part(coalesce(new.email, ''), '@', 1)
      )), '')
    )
    on conflict (user_id) do nothing;   -- idempotente: o front ainda faz upsert, e tudo bem
  exception when others then
    raise warning '[handle_new_user] profile não criado para % (%): %', new.id, new.email, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_user on auth.users;
create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on function public.handle_new_user() is
  'Cria public.profiles no cadastro (qualquer provedor). O INSERT dispara trg_welcome_credits, que concede os 50 créditos iniciais. Falha em silêncio de propósito: cadastro nunca pode quebrar por causa disto.';

-- ── 2. Backfill de quem passou pelo buraco ──────────────────────────────────────────────────────
-- O INSERT abaixo dispara trg_welcome_credits para cada linha nova, e essa função já é idempotente
-- (checa reason='welcome' no credit_ledger). Ou seja: quem ficou sem profile ganha os 50 créditos
-- que deveria ter ganho; quem já tem profile não é tocado e não ganha nada duas vezes.
insert into public.profiles (user_id, full_name)
select u.id,
       nullif(trim(coalesce(
         u.raw_user_meta_data ->> 'name',
         u.raw_user_meta_data ->> 'full_name',
         split_part(coalesce(u.email, ''), '@', 1)
       )), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;

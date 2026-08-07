-- Sistema de cupom de resgate de créditos.
--
-- POR QUE EXISTE: campanha de aquisição — o comprador de um infoproduto recebe um código que resgata
-- N créditos na plataforma. Chega no produto já pago, já educado e com saldo pra usar na hora.
--
-- POSTURA DE SEGURANÇA (isto aqui mexe com dinheiro):
--   - `grant_credits` está REVOGADA de `authenticated` (ver 20260716000000_fase0_seguranca_creditos.sql).
--     Mantemos assim: o resgate roda por `redeem_coupon` (SECURITY DEFINER, só service_role), chamada
--     pela edge function `redeem-coupon` que resolve o usuário pelo JWT — NUNCA pelo body.
--   - As três tabelas ficam com RLS ligada e ZERO policies (mesmo padrão de `billing_events`), mais
--     REVOKE explícito. O usuário não precisa ler cupom: o recibo dele já aparece em `credit_ledger`,
--     que tem a policy "own ledger".

create extension if not exists pgcrypto with schema extensions;

-- ── Campanhas ────────────────────────────────────────────────────────────────────────────────────
-- `id` é slug de texto (não uuid) porque o dono digita isso em query e em export de CSV.
-- A validade mora aqui (além de opcionalmente no código) pra um UPDATE só estender o lote inteiro.
create table if not exists public.coupon_campaigns (
  id          text primary key,
  name        text not null,
  credits     integer not null check (credits > 0),
  active      boolean not null default true,
  expires_at  timestamptz,
  source      text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

-- ── Códigos ──────────────────────────────────────────────────────────────────────────────────────
-- PK é o próprio código: o lookup do resgate é sempre por ele, então PK = índice único = lock por
-- linha de graça no FOR UPDATE, e a unicidade deixa de ser constraint secundária que dá pra esquecer.
-- Guardamos em plaintext (não hash) porque RLS+REVOKE já fecham a leitura e o suporte precisa achar
-- a linha quando o comprador diz "meu código TP-A7K2 não funciona".
create table if not exists public.coupon_codes (
  code              text primary key,
  campaign_id       text not null references public.coupon_campaigns(id) on delete restrict,
  batch_id          uuid not null,
  credits           integer,            -- null = herda da campanha
  expires_at        timestamptz,        -- null = herda da campanha
  status            text not null default 'active'
                    check (status in ('active','assigned','redeemed','void')),
  assigned_to_email text,               -- reservado p/ v2 (atribuição via webhook da plataforma)
  redeemed_by       uuid references auth.users(id) on delete set null,
  redeemed_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists coupon_codes_campaign_idx on public.coupon_codes(campaign_id, status);
create index if not exists coupon_codes_batch_idx    on public.coupon_codes(batch_id);

-- ⭐ A constraint mais importante do sistema.
-- Cenário que ela e SÓ ela pega: o MESMO usuário resgatando DOIS códigos DIFERENTES da mesma campanha
-- em paralelo. O FOR UPDATE não segura (são linhas distintas) e o SELECT de checagem das duas
-- transações passa, porque nenhuma commitou ainda. Aqui o segundo UPDATE bate no índice e falha 23505.
-- Custo assumido: enquanto existir, o limite é fixo em 1 resgate por campanha por usuário.
create unique index if not exists coupon_codes_campaign_user_uniq
  on public.coupon_codes(campaign_id, redeemed_by)
  where redeemed_by is not null;

-- ── Tentativas (anti-brute-force) ────────────────────────────────────────────────────────────────
-- Guardamos hash do IP, nunca o IP cru (privacidade).
create table if not exists public.coupon_redeem_attempts (
  id             bigint generated always as identity primary key,
  user_id        uuid references auth.users(id) on delete cascade,
  ip_hash        text,
  code_attempted text,
  result         text not null,
  created_at     timestamptz not null default now()
);

create index if not exists coupon_attempts_user_idx on public.coupon_redeem_attempts(user_id, created_at desc);
create index if not exists coupon_attempts_ip_idx   on public.coupon_redeem_attempts(ip_hash, created_at desc);

-- ── Idempotência no ledger ───────────────────────────────────────────────────────────────────────
-- Espelha o `credit_ledger_payment_uniq` que já existe pra reason='purchase'.
-- Vale mesmo tendo coupon_codes.status: se alguém resetar o status num UPDATE manual de suporte, o
-- ledger (append-only, fonte de verdade) ainda barra o crédito em dobro.
create unique index if not exists credit_ledger_coupon_uniq
  on public.credit_ledger(payment_ref)
  where reason = 'coupon' and payment_ref is not null;

-- ── RLS: ligada, sem policy nenhuma, mais REVOKE explícito ───────────────────────────────────────
alter table public.coupon_campaigns       enable row level security;
alter table public.coupon_codes           enable row level security;
alter table public.coupon_redeem_attempts enable row level security;

revoke all on public.coupon_campaigns       from anon, authenticated;
revoke all on public.coupon_codes           from anon, authenticated;
revoke all on public.coupon_redeem_attempts from anon, authenticated;

-- ── Resgate ──────────────────────────────────────────────────────────────────────────────────────
-- Retorna jsonb e NUNCA levanta exceção nos casos esperados. Isso é load-bearing: se levantasse, o
-- rollback levaria junto o INSERT em coupon_redeem_attempts e o rate limiter nunca veria uma falha.
create or replace function public.redeem_coupon(
  p_user    uuid,
  p_code    text,
  p_ip_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code    text;
  v_c       public.coupon_codes%rowtype;
  v_camp    public.coupon_campaigns%rowtype;
  v_exp     timestamptz;
  v_credits integer;
  v_balance integer;
  v_rows    integer;
  v_fails   integer;
begin
  -- 1. Normaliza: o código chega colado de email, com hífen, espaço, minúscula e lixo invisível.
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));

  -- O código é exibido como TP-XXXX-XXXX mas armazenado como os 8 caracteres puros. O comprador copia
  -- do email COM o prefixo, então sem isto todo resgate legítimo devolveria NOT_FOUND (pego em teste).
  if length(v_code) = 10 and left(v_code, 2) = 'TP' then
    v_code := substr(v_code, 3);
  end if;

  if length(v_code) <> 8 then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, left(v_code, 32), 'not_found');
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  -- 2. Rate limit ANTES de tocar em cupom.
  -- CAMPAIGN_ALREADY_REDEEMED fica de fora do contador de propósito: é comprador legítimo confuso,
  -- não atacante — contá-lo trancaria justamente quem pagou.
  select count(*) into v_fails
    from public.coupon_redeem_attempts
   where user_id = p_user
     and result in ('not_found','already_redeemed','expired','inactive')
     and created_at > now() - interval '1 hour';
  if v_fails >= 5 then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, left(v_code, 32), 'rate_limited');
    return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
  end if;

  if p_ip_hash is not null then
    select count(*) into v_fails
      from public.coupon_redeem_attempts
     where ip_hash = p_ip_hash
       and result in ('not_found','already_redeemed','expired','inactive')
       and created_at > now() - interval '1 hour';
    if v_fails >= 20 then
      insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
        values (p_user, p_ip_hash, left(v_code, 32), 'rate_limited');
      return jsonb_build_object('ok', false, 'error', 'RATE_LIMITED');
    end if;
  end if;

  -- 3. Lock da linha: serializa duplo-clique e dois usuários no mesmo código.
  select * into v_c from public.coupon_codes where code = v_code for update;
  if not found then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, left(v_code, 32), 'not_found');
    return jsonb_build_object('ok', false, 'error', 'NOT_FOUND');
  end if;

  select * into v_camp from public.coupon_campaigns where id = v_c.campaign_id;

  -- 4. Campanha desligada / código anulado.
  if not found or not v_camp.active or v_c.status = 'void' then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'inactive');
    return jsonb_build_object('ok', false, 'error', 'INACTIVE');
  end if;

  -- 5. Validade (do código, senão da campanha).
  v_exp := coalesce(v_c.expires_at, v_camp.expires_at);
  if v_exp is not null and v_exp < now() then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'expired');
    return jsonb_build_object('ok', false, 'error', 'EXPIRED');
  end if;

  -- 6. Já resgatado? Se foi pelo PRÓPRIO usuário, devolve sucesso idempotente — é o que transforma
  --    duplo-clique e retry de rede em UX boa, em vez de assustar quem pagou com "já foi usado".
  if v_c.status = 'redeemed' then
    if v_c.redeemed_by = p_user then
      select balance into v_balance from public.user_credits where user_id = p_user;
      insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
        values (p_user, p_ip_hash, v_code, 'ok_replay');
      return jsonb_build_object('ok', true, 'already', true,
        'credits', coalesce(v_c.credits, v_camp.credits),
        'balance', coalesce(v_balance, 0), 'campaign', v_camp.name);
    end if;
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'already_redeemed');
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
  end if;

  -- 7. Limite por campanha (caminho sequencial; o paralelo cai no 23505 do passo 8).
  perform 1 from public.coupon_codes
    where campaign_id = v_camp.id and redeemed_by = p_user limit 1;
  if found then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'campaign_already_redeemed');
    return jsonb_build_object('ok', false, 'error', 'CAMPAIGN_ALREADY_REDEEMED');
  end if;

  -- 8. Marca o consumo. O bloco exception abre subtransação — por isso o INSERT da tentativa fica
  --    FORA dele (dentro, o rollback do savepoint apagaria o log).
  begin
    update public.coupon_codes
       set status = 'redeemed', redeemed_by = p_user, redeemed_at = now()
     where code = v_code and status in ('active','assigned');
    get diagnostics v_rows = row_count;
  exception when unique_violation then
    v_rows := -1;   -- corrida do MESMO usuário em dois códigos da mesma campanha
  end;

  if v_rows = -1 then
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'campaign_already_redeemed');
    return jsonb_build_object('ok', false, 'error', 'CAMPAIGN_ALREADY_REDEEMED');
  end if;

  if v_rows = 0 then   -- outra transação ganhou a corrida neste mesmo código
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'already_redeemed');
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
  end if;

  -- 9. Concede. Funciona apesar do REVOKE de grant_credits porque SECURITY DEFINER roda com os
  --    privilégios do owner desta função.
  v_credits := coalesce(v_c.credits, v_camp.credits);
  begin
    v_balance := public.grant_credits(
      p_user, v_credits, 'coupon', 'coupon:' || v_code,
      jsonb_build_object('campaign', v_camp.id, 'batch', v_c.batch_id, 'source', v_camp.source)
    );
  exception when unique_violation then
    -- Índice do ledger: este código já creditou alguém antes.
    insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
      values (p_user, p_ip_hash, v_code, 'already_redeemed');
    return jsonb_build_object('ok', false, 'error', 'ALREADY_REDEEMED');
  end;

  insert into public.coupon_redeem_attempts(user_id, ip_hash, code_attempted, result)
    values (p_user, p_ip_hash, v_code, 'ok');

  return jsonb_build_object('ok', true, 'already', false,
    'credits', v_credits, 'balance', v_balance, 'campaign', v_camp.name);
end;
$$;

revoke all on function public.redeem_coupon(uuid, text, text) from public;
grant execute on function public.redeem_coupon(uuid, text, text) to service_role;

-- ── Geração de lote ──────────────────────────────────────────────────────────────────────────────
-- Alfabeto de 30 símbolos sem ambíguos (0/O, 1/I/L) e sem U (evita palavra acidental).
-- 8 caracteres → 30^8 ≈ 6,5e11. Entropia via gen_random_bytes (pgcrypto): random() do Postgres NÃO é
-- criptográfico e tornaria os códigos previsíveis a partir de alguns conhecidos.
create or replace function public.generate_coupon_batch(
  p_campaign   text,
  p_qty        integer,
  p_expires_at timestamptz default null
-- Nomes de saída propositalmente diferentes das colunas (`coupon_code`/`coupon_batch`): `code` como
-- variável de saída colidiria com a coluna `code` dentro do INSERT/ON CONFLICT.
) returns table(coupon_code text, coupon_batch uuid)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_batch    uuid := gen_random_uuid();
  v_made     integer := 0;
  v_code     text;
  v_bytes    bytea;
  i          integer;
begin
  perform 1 from public.coupon_campaigns where id = p_campaign;
  if not found then
    raise exception 'Campanha % não existe', p_campaign;
  end if;

  while v_made < p_qty loop
    v_code  := '';
    v_bytes := extensions.gen_random_bytes(8);
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 30) + 1, 1);
    end loop;

    -- Colisão é astronomicamente improvável, mas o on conflict custa nada e elimina a classe de bug.
    insert into public.coupon_codes(code, campaign_id, batch_id, expires_at)
      values (v_code, p_campaign, v_batch, p_expires_at)
      on conflict (code) do nothing;

    if found then
      v_made := v_made + 1;
      coupon_code := v_code; coupon_batch := v_batch;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.generate_coupon_batch(text, integer, timestamptz) from public;
grant execute on function public.generate_coupon_batch(text, integer, timestamptz) to service_role;

-- ── Funil ────────────────────────────────────────────────────────────────────────────────────────
-- security_invoker = on é OBRIGATÓRIO: view sem isso roda como owner e vira bypass de RLS,
-- anulando o REVOKE das tabelas acima.
create or replace view public.coupon_campaign_stats
with (security_invoker = on) as
select camp.id,
       camp.name,
       camp.credits,
       count(c.code)                                  as emitidos,
       count(*) filter (where c.status = 'redeemed')   as resgatados,
       count(*) filter (where c.status = 'active')     as disponiveis,
       min(c.redeemed_at)                              as primeiro_resgate,
       max(c.redeemed_at)                              as ultimo_resgate
from public.coupon_campaigns camp
left join public.coupon_codes c on c.campaign_id = camp.id
group by 1, 2, 3;

revoke all on public.coupon_campaign_stats from anon, authenticated;

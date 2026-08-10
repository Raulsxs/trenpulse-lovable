# Auditoria de Segurança — Pré-Lançamento Público

**Data:** 2026-08-10
**Escopo:** `src/` (React+Vite), `supabase/functions/` (Deno), `supabase/migrations/` (Postgres/RLS)
**Contexto:** produto sai de poucos usuários conhecidos para público aberto da internet, incluindo compradores de infoproduto. Billing por créditos pré-pagos (dinheiro real).
**Método:** leitura de código. Só está reportado o que foi **confirmado** lendo o arquivo. O que não deu para confirmar está marcado como tal.

---

## Contagem por severidade

| Severidade | Qtd |
|---|---|
| CRÍTICO | 4 |
| ALTO | 4 |
| MÉDIO | 5 |
| BAIXO | 3 |

---

## Os 3 mais urgentes (bloqueadores de lançamento)

1. **C-1** — `CREDITS_ENFORCED` desligado por padrão: geração acontece sem saldo. Dinheiro real saindo, receita zero.
2. **C-2** — `user_subscriptions` com policy `USING (true) WITH CHECK (true)`: qualquer usuário logado lê e escreve a linha de billing de **todos** os outros.
3. **C-3** — `generate-image` (chamada viva do front) gera imagem **sem debitar crédito e sem rate limit**: caminho de custo ilimitado para qualquer conta cadastrada.

---

# CRÍTICO

## C-1 — Enforcement de crédito desligado; caminho do agente nunca bloqueia

**Onde:**
- `supabase/functions/ai-chat/index.ts:411` — `const CREDITS_ENFORCED = Deno.env.get("CREDITS_ENFORCED") === "true";`
- `supabase/functions/ai-chat/index.ts:434-437` — com a flag off, `insufficientCredits()` **só loga e retorna `null`**, deixando a geração seguir.
- `supabase/functions/_shared/agent-tools.ts:490-494` (e igualmente `:581`, `:697`, `:763`) — o débito roda **depois** da entrega, dentro de `try/catch`; se `spend_credits` falhar por saldo, apenas loga `"post entregue sem cobrança"` e devolve o conteúdo mesmo assim.

**Risco concreto:** qualquer usuário com saldo 0 gera conteúdo indefinidamente. Cada post custa provider real (gpt-image-2 ≈ $0.0625/imagem; Nano Banana Pro ≈ $0.15). Um comprador de infoproduto que descubra isso — ou simplesmente use o produto normalmente após esgotar o saldo — gera custo direto sem receita. O pre-check já foi escrito e está posicionado corretamente em todos os cases de geração (`:818`, `:1333`, `:1836`, `:2048`, `:2203`, `:2305`); ele só está **desarmado**.

Atenção: mesmo ligando a flag, o caminho `/agent` (`agent-tools.ts`) continua sem bloqueio — ele não consulta `insufficientCredits`, só tenta debitar no fim e engole o erro.

**Correção:** setar o secret `CREDITS_ENFORCED=true` **antes** de abrir o cadastro público; e no `agent-tools.ts`, mover o débito para **antes** da entrega (ou adicionar pre-check de saldo no início de cada tool que gera), tratando `INSUFFICIENT_CREDITS` como recusa em vez de log.

---

## C-2 — `user_subscriptions`: leitura e escrita cruzada entre usuários

**Onde:** `supabase/migrations/20260330003557_7b6c9a40-8a7c-41d0-ac5d-209febabcec9.sql:78`

```sql
CREATE POLICY "us_svc" ON public.user_subscriptions FOR ALL USING (true) WITH CHECK (true);
```

**Risco concreto:** o nome sugere "service", mas **não há cláusula `TO`** — a policy vale para `PUBLIC`, ou seja `anon` + `authenticated`. Qualquer usuário logado faz `select * from user_subscriptions` e recebe a linha de billing de todo mundo (`asaas_customer_id`, `asaas_subscription_id`, `status`, `current_period_end`), e pode dar `UPDATE`/`INSERT` para forjar o próprio plano ou adulterar o de terceiros. Nunca foi removida por migration posterior.

**Correção:** `DROP POLICY "us_svc"` e recriar como `FOR ALL TO service_role USING (true) WITH CHECK (true)` — a policy `us_sel` (`:77`, `auth.uid()=user_id`) já cobre a leitura legítima do dono.

---

## C-3 — Endpoints de geração sem cobrança e sem rate limit

**Onde:**
- `supabase/functions/generate-image/index.ts:53-63` — autentica via `getClaims` e **não debita crédito algum** (nenhuma chamada a `spend_credits`/`chargeCredits` no arquivo). Chamado ao vivo pelo front em `src/pages/ContentPreview.tsx:857` e `:1035`.
- `supabase/functions/search-images/index.ts:48` — mesma ausência de cobrança (consome cota Unsplash).
- `supabase/functions/generate-content/index.ts:527` — idem.
- `supabase/functions/analyze-brand-examples/index.ts:32` e `generate-style-pack` — geração/visão sem débito; `generate-style-pack` é invocado do front em `src/components/chat/ChatWindow.tsx:608`.

**Risco concreto:** qualquer conta cadastrada (basta um e-mail) chama `generate-image` direto via `supabase.functions.invoke` — ou em loop com `fetch` — e queima chave de provider indefinidamente, sem tocar no saldo de créditos. Ligar `CREDITS_ENFORCED` **não fecha esse buraco**, porque a flag só existe no `ai-chat`. É o caminho mais barato de exploração: não exige nenhum conhecimento de RLS, só um DevTools aberto.

**Correção:** plugar `chargeCredits` + pre-check de saldo nesses handlers, ou — se forem legado do fluxo antigo — remover as funções e as chamadas em `ContentPreview.tsx`.

---

## C-4 — Nenhum rate limit por usuário em geração

**Onde:** confirmado por varredura: os únicos `rate limit` do código são (a) tratamento de 429 **de provedor externo** (`generate-slide-images/index.ts:225,829`; `ai-chat/index.ts:1465,1539`) e (b) o rate limiter de **resgate de cupom** (`supabase/migrations/20260807120000_coupon_redemption.sql:139-152`). Não existe limite de gerações por usuário/hora em nenhuma função.

**Risco concreto:** combinado com C-1 e C-3, um único usuário mantém N requisições concorrentes de geração de imagem. Mesmo com `CREDITS_ENFORCED=true`, a ausência de limite permite: (i) esgotar o crédito de boas-vindas em segundos de propósito e depois abrir chamado/estorno; (ii) rajada concorrente que passa pelo pre-check antes do débito do primeiro job liquidar (o `spend_credits` é atômico com `FOR UPDATE`, mas o **pre-check** `insufficientCredits` lê o saldo fora da transação de débito — janela de corrida com saldo baixo). Ver também A-2 (farming de contas).

**Correção:** rate limit por `user_id` (ex.: contagem em `generation_jobs`/`credit_ledger` na última hora) na entrada do `ai-chat`/`ai-agent`, e limite de concorrência (1-2 jobs `processing` por usuário — a fila `generation_jobs` já dá o gancho).

---

# ALTO

## A-1 — `usage_tracking` e `content_metrics` com policy permissiva a todos

**Onde:**
- `supabase/migrations/20260318_billing_tables.sql:73-76` — `"Service role manages usage" ON usage_tracking FOR ALL USING (true) WITH CHECK (true)`
- `supabase/migrations/20260318_content_metrics.sql:25-28` — `"Service role manages metrics" ... FOR ALL USING (true) WITH CHECK (true)`
- `supabase/migrations/20260330003557_...sql:96` — `"cm_svc" ON content_metrics FOR ALL USING (true) WITH CHECK (true)`

Mesmo defeito de C-2: sem cláusula `TO`, valem para `anon`/`authenticated`. Nenhuma foi dropada depois.

**Risco concreto:** qualquer usuário lê e forja a contagem de gerações de qualquer outro (`usage_tracking`) e lê as métricas de engajamento Instagram/LinkedIn de todos os clientes (`content_metrics`).

**Correção:** dropar as três e recriar com `TO service_role`; as policies de leitura do dono já existem (`20260330003123_...:95`, `20260318_content_metrics.sql:21`).

---

## A-2 — Crédito de boas-vindas sem barreira antifarming

**Onde:** `supabase/migrations/20260726140000_fix_welcome_credits_userid.sql:13-15` — trigger concede **50 créditos** a cada perfil criado; idempotente por usuário (guard em `credit_ledger ... reason='welcome'`), mas não por pessoa/dispositivo/e-mail.

**Risco concreto:** 50 créditos ≈ 12 posts (post = 4cr, `credit_pricing`), com custo de provider na casa de ~$0.75 por conta falsa. Com cadastro público e sem rate limit (C-4), farming de e-mails descartáveis converte diretamente em custo. **Não confirmei** se confirmação de e-mail está exigida no Supabase Auth — isso é config do painel, não está no repo, e muda bastante a exposição. Verificar antes de lançar.

**Correção:** exigir confirmação de e-mail no Auth; considerar reduzir o welcome ou condicioná-lo a e-mail verificado (mover o trigger para `email_confirmed_at`).

---

## A-3 — `get_cron_users_due()`: ACL possivelmente ainda concedida a `anon`/`authenticated` (NÃO CONFIRMADO)

**Onde:**
- Grants diretos: `supabase/migrations/20260310142907_...sql:35-36` e `20260330003557_...sql:138-139` — `GRANT EXECUTE ... TO anon;` e `TO authenticated;`
- Revoke posterior: `supabase/migrations/20260716000000_fase0_seguranca_creditos.sql:24` — `REVOKE ALL ON FUNCTION public.get_cron_users_due() FROM PUBLIC;`

**Risco concreto:** em Postgres, `REVOKE ... FROM PUBLIC` remove apenas o privilégio do pseudo-role `PUBLIC`; **não remove grants diretos** a `anon`/`authenticated`. Se os grants diretos sobreviveram, a função (`SECURITY DEFINER`) devolve `whatsapp_number` e o `ai_user_context` completo (nicho, tom, tópicos, `extra_context`) de **todos** os usuários — para um chamador anônimo. Isso seria um vazamento de PII em massa e passaria C-2 em gravidade.

**Não confirmado** — depende do estado do catálogo, que não dá para determinar pelo SQL. Rodar antes do lançamento:
```sql
SELECT proacl FROM pg_proc WHERE proname = 'get_cron_users_due';
```
Se aparecer `anon=X/...` ou `authenticated=X/...`, está aberto.

**Correção:** `REVOKE ALL ON FUNCTION public.get_cron_users_due() FROM anon, authenticated;` (idempotente, seguro rodar de qualquer jeito). O mesmo caveat **não** se aplica a `grant_credits`/`debit_credits`/`reset_monthly_credits` — essas só tinham o default de `PUBLIC`, que o revoke removeu de fato.

---

## A-4 — SSRF na extração de conteúdo de link

**Onde:** `supabase/functions/ai-chat/index.ts:203-211`, dentro de `extractArticleContent()` (definida em `:142`), alcançada por URL colada pelo usuário no chat — chamada em `:878`, `:1391`, `:1850`, `:2057`.

```ts
const resp = await fetch(url, { headers: {...}, redirect: "follow", signal: controller.signal });
```

Não há validação de esquema, host ou faixa de IP. Jina (`:124`) e Firecrawl (`:171`) são tentados primeiro e são externos (seguros), mas o **fallback direto** roda de dentro do runtime da edge function.

**Risco concreto:** o usuário cola `http://169.254.169.254/...` (metadata de cloud) ou um host interno; o corpo da resposta é extraído (`:217-219`), injetado no prompt e volta no conteúdo gerado — ou seja, é um canal de **exfiltração legível**, não SSRF cega. `redirect: "follow"` também permite driblar uma allowlist só de host via redirect. Não confirmei quais endpoints internos são de fato alcançáveis do runtime Supabase.

**Correção:** antes do fetch de fallback, validar `u.protocol === "https:"` (ou `http:`) e resolver/rejeitar destinos privados (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `.internal`, `localhost`); usar `redirect: "manual"` e revalidar cada salto.

---

# MÉDIO

## M-1 — `profiles` UPDATE sem restrição de coluna: usuário troca o próprio `account_type`

**Onde:** `supabase/migrations/20260330003154_90a1668d-a60b-4570-afd5-f472ce7cdaa5.sql:23`
```sql
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
```
A checagem de dono está certa, mas a linha acumulou colunas privilegiadas:
- `account_type` (`20260508000001_...:6`) — escrever dispara `trg_sync_account_type` (`20260508000004_...:22`, `SECURITY DEFINER`), que grava em `auth.users.raw_app_meta_data`. **O usuário flipa o próprio `app_metadata.account_type` do JWT à vontade.**
- `credits_balance` (`20260529000001_credit_system.sql:7`) — auto-atribuível.
- `gemini_api_key` (`20260517000001_...:9`) — texto plano, auto-gravável (leitura é só da própria linha, então não vaza entre usuários).

**Por que MÉDIO e não crítico:** confirmei que `credits_balance` é **carteira legada e morta** — a fonte de verdade é `user_credits`, e `src/components/billing/CreditsBadge.tsx:10` documenta explicitamente "NÃO usar profiles.credits_balance". Nenhuma edge function em TS chama `debit_credits`. E `account_type` hoje só troca a experiência de UI (`src/hooks/useAccountType.ts:33`, `src/pages/Index.tsx:18`), não é fronteira de privilégio. O risco é o de **amanhã**: no dia em que `account_type` virar gate de feature paga, essa policy vira escalação de privilégio.

**Correção:** trigger `BEFORE UPDATE` que rejeita mudança em `account_type`/`credits_balance` quando `auth.uid()` não é service_role, ou mover as colunas para tabela separada sem policy de escrita.

---

## M-2 — `getClaims()` usado para autenticação em 4 funções

**Onde:**
- `supabase/functions/analyze-brand-examples/index.ts:32`
- `supabase/functions/search-images/index.ts:48`
- `supabase/functions/generate-image/index.ts:53`
- `supabase/functions/generate-download/index.ts:313`

**Risco concreto:** o `CLAUDE.md` do projeto e o aprendizado registrado dizem explicitamente **"NUNCA use `getClaims()` — retorna o `user.id` errado"**, e mandam usar `getUser()`. Onde `claims.sub` dirige a identidade, isso é bug de **autorização** (ação atribuída ao usuário errado), não só de correção. Em `generate-image` o `sub` só é logado (`:63`), então ali é inofensivo; **não tracei** o uso derivado em `generate-download` e `analyze-brand-examples` — por isso MÉDIO e não ALTO. Vale um passe dedicado.

**Correção:** trocar as quatro por `supabase.auth.getUser()`.

---

## M-3 — Buckets públicos sem limite de tipo nem de tamanho

**Onde:** `supabase/migrations/20260330003618_...sql:3-5` — `content-images`, `generated-images`, `guides` criados com `public: true`, **sem `file_size_limit` e sem `allowed_mime_types`** (confirmado: nenhuma migration define essas colunas). Policy de upload em `:9`:
```sql
CREATE POLICY "Auth upload content-images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'content-images');
```
O `WITH CHECK` só valida o bucket — não amarra o path ao `auth.uid()`.

**Risco concreto:** qualquer conta cadastrada sobe arquivo de **qualquer tipo e qualquer tamanho** num bucket de leitura pública. Vira CDN grátis para hospedar conteúdo arbitrário sob o domínio Supabase do projeto (incluindo HTML servido com content-type próprio → XSS armazenado no domínio do storage), e é vetor de custo de armazenamento/egress. A validação de tipo/tamanho que existe é **só no front** (`src/components/content/ImageUpload.tsx:46,51` — 10MB e `image/*`), trivialmente contornável chamando o storage direto com a anon key.

**Correção:** setar `allowed_mime_types` (`image/jpeg,image/png,image/webp`) e `file_size_limit` (ex.: 10MB) nos três buckets, e endurecer o `WITH CHECK` para prefixar o path com `auth.uid()`.

---

## M-4 — `agent_message_log` guarda conteúdo de conversa sem retenção declarada (LGPD)

**Onde:** `supabase/migrations/20260707000000_agent_message_log.sql:4-12` — colunas `content` (texto integral da mensagem do usuário e da resposta) e `tool_calls` (jsonb com os inputs).

**Risco concreto:** com público desconhecido entrando, o log passa a acumular o que estranhos digitam — potencialmente dado pessoal/sensível — sem política de retenção, sem anonimização e sem caminho de exclusão a pedido do titular (LGPD art. 18). A RLS está **correta** (`:20-21`, `auth.uid() = user_id`, select-only, escrita só por service_role); o problema é ciclo de vida, não controle de acesso. O propósito original ("auditar clientes em teste, ex.: Maikon", comentário em `:1-3`) não cobre uso público.

**Correção:** definir retenção (ex.: purge por `pg_cron` após 30-90 dias), declarar o log na política de privacidade, e ter rotina de exclusão por titular.

---

## M-5 — `templates_select_public` sem cláusula `TO` expõe catálogo a `anon`

**Onde:** `supabase/migrations/20260513000001_adapt_templates_schema.sql:130-131` — `USING (is_personal = false AND is_active = true)` sem `TO`, ao contrário das policies irmãs em `20260508000002_...:47-73` que são `TO authenticated`.

**Risco concreto:** o catálogo curado de templates fica legível por usuário anônimo. O predicado impede vazar template pessoal de terceiro, então não é dado de usuário — é ativo de produto exposto a não-cadastrados (concorrente copia o catálogo). Baixo impacto, mas é alargamento provavelmente não intencional.

**Correção:** recriar com `TO authenticated`.

---

# BAIXO

## B-1 — `.env` esteve no histórico do git (conteúdo: só chave anon)

`.env` foi commitado em `43453cf` (2026-03-29), modificado em `b0c1632` e `1c44cb1`, e deletado em `3c1c427` (2026-06-28) — os blobs seguem acessíveis e foram enviados ao remote `github.com/Raulsxs/trenpulse-lovable`. **Confirmado por inspeção dos blobs históricos:** continham apenas `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_PUBLISHABLE_KEY`. Todos os JWTs decodificados têm `role: anon`. **Nenhuma service_role key, chave de provider ou senha esteve no histórico.** Exposição limitada a valores que já são públicos por design. Limpeza de histórico é opcional, não urgente.

## B-2 — `is_brand_visible_to_user()` executável por `anon`/`authenticated`

`supabase/migrations/20260217165000_...:3` (redeclarada em `20260330003354_...:15-16`) — única função `SECURITY DEFINER` do schema **sem `REVOKE`**. Retorna apenas booleano, então é um oráculo, não um dump: exige adivinhar dois UUIDs para confirmar "a marca X pertence/é compartilhada com o usuário Y". **Correção:** `REVOKE ALL ... FROM PUBLIC; GRANT EXECUTE ... TO authenticated;` por consistência.

## B-3 — Chave anon duplicada em 3 arquivos do front

`src/integrations/supabase/client.ts:6`, `src/hooks/useGenerationQueue.ts:25`, `src/pages/AgentChat.tsx:27` repetem o mesmo literal. Não é vazamento (é a publishable key, `role: anon` — correto e esperado no bundle), é higiene: uma rotação exigiria três edições. **Correção:** importar de `client.ts`.

---

# O que está BEM feito — não mexer

Registrado de propósito para evitar "consertar" o que já está certo:

- **`_shared/require-auth.ts` é sólido.** Aceita exatamente dois chamadores (service key exata OU JWT de usuário validado por `getUser()`), rejeita anon key e `"Bearer x"`, e devolve `{userId, internal}` deixando explícito que o `body.userId` só vale no caminho interno. `generate-slide-images:293,337`, `generate-video:76,91` e `render-slide-image:829` usam certo.
- **Nenhuma função com `verify_jwt=false` está aberta.** Auditei as 7 do `config.toml`: `connect-social` (`getUser`, `:52`), `publish-postforme` (`getUser` + checagem cruzada `userId !== content.user_id` → 403, `:83-88`), `render-slide-image` / `generate-slide-images` / `generate-video` (`requireAuth`), `asaas-webhook` (compara header `asaas-access-token` com `ASAAS_CREDITS_WEBHOOK_TOKEN`, `:17-21`), `process-generation-jobs` (só aceita `body.userId` quando o token **é** a service key, `:131,135-143`; caminho de usuário faz `getUser`, `:157`). `diag-vision` está no config mas **o diretório não existe** — entrada morta, sem função publicada.
- **`spend_credits` está corretamente blindada.** `20260716000000_...:44-46` — guard `if auth.uid() is not null and p_user <> auth.uid() then raise exception 'FORBIDDEN'`, com `FOR UPDATE` para atomicidade. `grant_credits`, `debit_credits`, `reset_monthly_credits`, `claim_next_job`, `redeem_coupon`, `generate_coupon_batch` estão todas com `REVOKE ALL FROM PUBLIC` + `GRANT TO service_role` (`20260716000000_...:20-27`, `20260807120000_...:252-253,304-305`).
- **Nenhum segredo no bundle do front.** Varredura de `sk-`, `sb_secret`, `service_role`, `AIza`, e dos nomes de todos os providers em `src/`: zero. **Zero uso de `import.meta.env`** — não existe caminho de env-var para o bundle. Nenhuma chamada direta a API de terceiro do browser. `.gitignore:13,15-20` cobre `.env`, `.env.*`, `*.key`, `*.pem`, `*.local`, e `git ls-files` confirma que nada sensível está rastreado hoje. `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ACCESS_TOKEN` vivem só em `.env.local`, não rastreado e sem prefixo `VITE_`.
- **Nenhum log vaza segredo.** Revisadas as 399 chamadas `console.*` das 27 funções. O padrão consistente é logar comprimento, prefixo, `.slice(0,N)`, status HTTP e IDs. Casos que pareciam risco e não são: `connect-social:170` loga o body (a chave vai no header, `:175`), `asaas-webhook:19` loga string estática, `generate-slide-images:355` loga só presença booleana da chave, `_shared/ai-gateway.ts:635` loga nomes de chave e não valores.
- **Tratamento de IP é melhor que a média.** `redeem-coupon/index.ts:33-41` faz SHA-256 do `x-forwarded-for` com pepper (`COUPON_IP_PEPPER`) antes de tocar o banco; a coluna é `ip_hash` (`20260807120000_...:66`). IP cru nunca é logado nem persistido. Não existe coluna `ip_address`/`user_agent` em lugar nenhum do schema.
- **As 3 views têm `security_invoker = on`.** `coupon_campaign_stats` (`20260807120000_...:311`), `agent_quality_metrics` e `agent_failure_cases` (`20260810120000_...:24,54`) — nenhuma fura a RLS das tabelas de baixo.
- **Tabelas de cupom são o padrão-ouro do schema:** RLS ligada com **zero policies** + `revoke all ... from anon, authenticated` (`20260807120000_...:84-90`), e rate limiter próprio no `redeem_coupon` (`:139-152`).
- **RLS correta e com ownership real** em: `generated_contents`, `brands`, `brand_examples`, `chat_messages`, `ai_user_context`, `user_credits` (select-only), `credit_ledger` (select-only, append-only), `billing_events` (fechada), `social_connections`, `generation_jobs` (com guard de status que impede o usuário tocar linhas `processing`), `agent_message_log`, `agent_user_memory`, `templates`. **Nenhuma tabela do schema `public` ficou sem RLS habilitada.**

---

## Checklist antes de abrir o cadastro público

- [ ] `CREDITS_ENFORCED=true` no Supabase secrets (C-1)
- [ ] Bloquear entrega sem saldo no caminho `/agent` (C-1)
- [ ] Dropar/recriar `us_svc`, `"Service role manages usage"`, `"Service role manages metrics"`, `cm_svc` com `TO service_role` (C-2, A-1)
- [ ] Cobrar crédito em `generate-image`/`search-images`/`generate-content`/`generate-style-pack`, ou removê-las (C-3)
- [ ] Rate limit + limite de concorrência por usuário (C-4)
- [ ] Rodar `SELECT proacl FROM pg_proc WHERE proname='get_cron_users_due';` e revogar de `anon, authenticated` (A-3)
- [ ] Exigir confirmação de e-mail no Supabase Auth (A-2)
- [ ] Validar host/IP privado em `extractArticleContent` (A-4)
- [ ] `allowed_mime_types` + `file_size_limit` nos 3 buckets (M-3)
- [ ] Definir retenção do `agent_message_log` + política de privacidade (M-4)

# Auditoria de Estabilidade — pré-lançamento público

> Data: 2026-08-10. Escopo: `supabase/functions/**` + `src/**` do TrendPulse.
> Objetivo: identificar o que quebra quando o produto sai de poucos usuários conhecidos
> para tráfego real e simultâneo.
>
> **Regra desta auditoria:** só entra aqui o que foi **confirmado lendo o código**. O que não
> deu pra confirmar está explicitamente marcado como `[NÃO CONFIRMADO]` na seção 9.

## Contagem por severidade

| Severidade | Qtd |
|---|---|
| CRÍTICO | 4 |
| ALTO | 6 |
| MÉDIO | 8 |
| BAIXO | 3 |

**Top 3 por urgência** (severidade × chance de acontecer no 1º mês):

1. **C-1** — job da fila trava em `processing` para sempre e o usuário não consegue nem cancelar.
2. **C-2** — o reaper re-executa o job e **cobra o usuário de novo** (até 3×) pelo mesmo pedido.
3. **C-3** — conteúdo agendado trava em `publishing` para sempre; nunca publica, nunca falha, nunca avisa.

---

## Fatos de contexto (dados de entrada, não reconfirmados)

- 1 post: 50–103s; a maior parte é a geração da imagem.
- Variância alta no mesmo modelo (69s–103s no `gpt-image-2`).
- Carrossel dispara 4–6 requisições de imagem **em paralelo** (`Promise.all`).
- O worker processa 1 job por usuário por invocação e re-encadeia.

O limite de wall-clock da edge não está documentado no repo; o próprio código assume
**~150–400s** (`supabase/functions/process-generation-jobs/index.ts:25-28`). Toda a análise
abaixo usa essa faixa como referência.

---

# CRÍTICO

## C-1 — Job órfão em `processing` nunca é recuperado quando é o único job do usuário

**Onde:**
- `supabase/functions/process-generation-jobs/index.ts:141` — o caminho CRON varre apenas
  `.eq("status", "queued")`.
- `supabase/migrations/20260726130000_claim_next_job_reaper.sql` — o reaper vive **dentro** de
  `claim_next_job(p_user)`, ou seja, só roda se alguém chamar a RPC **para aquele usuário**.
- `supabase/migrations/20260726120000_generation_jobs_queue.sql` — a policy
  `generation_jobs_update_own` permite UPDATE só em `('queued','done','failed','needs_review')`;
  **`processing` está fora**.

**O que acontece:** o worker morre no wall-clock no meio de uma geração longa. O job fica em
`processing`. O cron busca só usuários com job `queued` — esse usuário não aparece. O reaper
nunca roda para ele. O job fica travado **indefinidamente**.

**O que o usuário sente:** o card na fila fica com "Gerando…" e o spinner girando para sempre
(`src/components/chat/QueuePanel.tsx:9` — `processing` não tem estado de expiração no front).
Ele clica em cancelar: **a RLS bloqueia** (o status `processing` não está na policy de UPDATE).
Ele só consegue deletar a linha. Ninguém avisa nada.

**Correção:** varredura global no cron (`status='processing' AND started_at < now()-4min`)
independente de haver `queued`, ou uma RPC `reap_stale_jobs()` chamada no topo do caminho
interno. Adicionar `processing` na policy de UPDATE só para o próprio dono cancelar.

---

## C-2 — Re-execução do job cobra o usuário de novo (até 3×) pelo mesmo pedido

**Onde:**
- `supabase/migrations/20260726130000_claim_next_job_reaper.sql` — `attempts < 3` → volta para
  `queued` e re-executa.
- `supabase/functions/process-generation-jobs/index.ts:80` — `runAgentHeadless` refaz o pedido
  inteiro do zero.
- `supabase/functions/ai-chat/index.ts:1294, 1801, 2021, 2186, 2263, 2433` — `chargeCredits`
  roda **dentro** da geração, antes do worker marcar `done`.

**O que acontece:** a geração termina, `chargeCredits` debita, o `ai-chat` responde, o `ai-agent`
responde — e o worker é morto pelo wall-clock **antes** de gravar `status='done'`. O reaper
devolve o job para `queued`. O agente gera **tudo de novo** e **debita de novo**. Não existe
chave de idempotência nem vínculo entre `generation_jobs.id` e `credit_ledger`.

**Probabilidade real:** alta. Um job de carrossel leva ~100–200s dentro de um worker cujo
orçamento total é 150–400s; o reaper dispara em 4 min. É exatamente a janela.

**O que o usuário sente:** saldo cai 2× ou 3× por um único pedido, e ele acaba com 2–3 conteúdos
duplicados na biblioteca (cada re-execução cria um `generated_contents` novo).
Isso vira ticket de reembolso.

**Correção:** passar o `job_id` até `chargeCredits` e tornar o débito idempotente
(unique em `credit_ledger(job_id)` ou `ON CONFLICT DO NOTHING`); e/ou o worker gravar
`content_id` incrementalmente antes de finalizar.

---

## C-3 — Conteúdo agendado trava em `publishing` para sempre

**Onde:**
- `supabase/functions/instagram-scheduler/index.ts:65-71` — trava a linha em `status="publishing"`
  **antes** de chamar o publisher (lock otimista, correto em si).
- `supabase/functions/instagram-scheduler/index.ts:30-37` — o cron só busca `status='scheduled'`.
- `supabase/functions/instagram-scheduler/index.ts:266-271` — a reconciliação só cobre
  `status='processing'` **com** `generation_metadata->pfm_pending`.
- Busca global: `publishing` só aparece sendo **escrito**, nunca sendo revertido
  (`grep '"publishing"'` → apenas o scheduler e o CHECK constraint).

**O que acontece:** o `publish-postforme` morre (wall-clock, exceção não tratada, gateway).
A linha fica em `publishing`. O cron nunca mais a pega (filtra `scheduled`). A reconciliação
nunca a pega (filtra `processing`). Fica ali.

**Risco de wall-clock é concreto:** `publish-postforme/index.ts:287-291` faz até **8 polls ×
3s** por conta; e para *story carousel* publica **N stories em SEQUÊNCIA**
(`publish-postforme/index.ts:337-341`). Um carrossel de 8 stories = 8 × (chamada PFM + até 26s de
poll) ≈ 200s+ numa única invocação.

**O que o usuário sente:** o post agendado simplesmente nunca sai. Nenhum erro, nenhuma
notificação. Ele descobre olhando o Instagram no dia seguinte.

**Correção:** incluir `publishing` na reconciliação do scheduler (`status='publishing' AND
updated_at < now()-10min` → volta para `scheduled` se `publish_attempts<3`, senão `failed`).

---

## C-4 — Nenhum limite de concorrência nas chamadas de imagem

**Onde:**
- `supabase/functions/ai-chat/index.ts:1634` e `1637` — `Promise.all` sobre todos os slides.
- `supabase/functions/ai-chat/index.ts:2120` e `2142` — editorial: `Promise.all` nas fotos e
  **outro** `Promise.all` nos renders.
- Não existe semáforo, pool, batching nem fila de saída em nenhum ponto do caminho de imagem.

**Aritmética confirmada no código:** 10 usuários gerando carrossel de 5 slides ao mesmo tempo =
**50 requisições simultâneas** ao provedor. Nada do nosso lado limita isso. O único freio é o
`estimateToolCost` do agente (`_shared/agent-tools.ts:32,62`), que pede confirmação acima de 50
créditos — mas ele **só existe no chat interativo**; no modo fila esse gate é
**auto-aprovado por design** (`ai-agent/index.ts:266-268`).

**Efeito composto com o wall-clock:** o `ai-chat` segura todas as N imagens numa invocação só.
Com 5 slides a ~68s cada em paralelo, uma cauda longa (a variância medida vai a 103s) mais a
estrutura + legenda + variantes de plataforma coloca o total perigosamente perto do teto.
O próprio código já reconhece isso: o comentário em `_shared/openrouter.ts:277` diz que
`quality:"high"` "arriscaria o 504 do carrossel".

**O que o usuário sente:** ou 504/erro genérico no meio do carrossel, ou carrossel incompleto
("3 de 5 slides"), ou 429 do provedor upstream que derruba slides aleatórios.

**Correção:** pool de concorrência (ex.: máx 3 imagens em voo por request, e um teto global por
usuário), e mover carrossel para geração incremental slide-a-slide (já recomendado em
`docs/arquitetura/latencia-e-rate-limits.md` §2.4).

---

# ALTO

## A-1 — `CREDITS_ENFORCED` está desligado por padrão

**Onde:** `supabase/functions/ai-chat/index.ts:411` —
`const CREDITS_ENFORCED = Deno.env.get("CREDITS_ENFORCED") === "true";`
`index.ts:433-437` — com a flag desligada, `insufficientCredits` **loga e deixa passar**.

Todos os 6 pontos de pré-checagem (`ai-chat/index.ts:818, 1333, 1836, 2048, 2203, 2305`)
dependem dessa flag.

**Sintoma:** com saldo zero o usuário continua gerando à vontade pelo caminho do `ai-chat`.
No dia do lançamento público isso é um ralo de custo direto (cada imagem custa $0,05–0,14) e um
vetor de abuso trivial: criar conta, queimar crédito de API alheio.

Nota: as tools do agente que **não** passam pelo `ai-chat` fazem pré-checagem própria, real
(`_shared/agent-tools.ts:438-440, 529-531, 655-657, 714-718`). A inconsistência é o problema —
metade do produto bloqueia, metade não.

**Correção:** setar `CREDITS_ENFORCED=true` nos secrets antes do lançamento e validar os 6
caminhos. [NÃO CONFIRMADO: não dá para ler os secrets de produção daqui.]

## A-2 — Falha de débito é engolida: conteúdo entregue de graça, em silêncio

**Onde:** `supabase/functions/ai-chat/index.ts:420-426` —
`if (error) console.warn(...) chargeCredits ... skipped`.

O `spend_credits` **lança exceção** quando não há saldo
(`supabase/migrations/20260609120000_credits_system.sql:66` —
`raise exception 'INSUFFICIENT_CREDITS'`). Ou seja: com `CREDITS_ENFORCED` desligado, a
pré-checagem deixa passar, a geração acontece, o débito falha, e o `console.warn` é o único
registro. Custamos dinheiro e não cobramos.

As tools do agente pelo menos logam com `console.error` e texto explícito
(`_shared/agent-tools.ts:491, 582, 698, 764`) — mas continuam sendo só log.

**Correção:** transformar débito falho em linha numa tabela de reconciliação (`credit_debt`) em
vez de log, para dar pra cobrar/estornar depois.

## A-3 — Front: 50–103s de espera síncrona, sem progresso e com erro genérico

**Onde:**
- `src/components/chat/ChatWindow.tsx:837` — `supabase.functions.invoke("ai-chat", ...)`,
  sem `AbortController`, sem timeout, sem feedback de progresso.
- `src/pages/Studio.tsx:291` — idem.
- `src/components/chat/ActionCard.tsx:783, 833` — idem, para "Ajustar"/"Refazer".
- `ChatWindow.tsx:905-912` — **qualquer** falha vira
  `"Ops, tive um problema de conexão. Pode repetir?"`.

**O que o usuário sente:** spinner mudo por até 100s (a UI não distingue "lento" de "morto"),
e quando o gateway devolve 504 ele vê uma mensagem que **sugere repetir**. Se o `ai-chat`
chegou a salvar o conteúdo e debitar antes do timeout do gateway, repetir gera e cobra a
**segunda** vez. O conteúdo da primeira está salvo em `generated_contents`
(`ai-chat/index.ts:1265`) mas ele não sabe — o `chat_messages` só é gravado no **final**
da função (`ai-chat/index.ts:3227`), então a mensagem some do histórico.

**Correção:** timeout explícito no cliente com mensagem distinta ("ainda gerando — confira em
Meus Conteúdos"), e gravar o `chat_messages` do usuário **antes** de gerar, não depois.

## A-4 — Observabilidade: praticamente zero

**Confirmado por busca:** nenhuma ocorrência de `Sentry`, `captureException`, `logflare`,
`posthog` em `src/` ou `supabase/functions/`. Nenhuma tabela de telemetria de geração
(`telemetry`, `generation_log`, `error_log` — zero resultados).

O que existe hoje:
- `console.log`/`console.error` estruturado-ish com prefixo `[ai-chat]`, `[jobs]`,
  `[generate-slide-images]` — bom formato, mas preso à retenção curta do Supabase.
- `credit_ledger` — registro durável de **cobranças**, não de falhas.
- `agent_message_log` (`migrations/20260707000000_agent_message_log.sql` / `ai-agent/index.ts:244`)
  — durável, cobre só o `/agent`.
- `admin-analytics` — agrega `profiles`, `usage_tracking`, `image_generations`,
  `generated_contents`, `chat_messages` (`admin-analytics/index.ts:71-98`). É um painel de
  negócio, não de incidente.

**Consequência:** não existe nenhuma forma de saber que a taxa de falha subiu, que o provedor
está devolvendo 429, que N jobs estão travados, ou quanto custou uma geração — sem um usuário
reclamar. Depois do fato, os logs já expiraram.

**Correção mínima antes do lançamento:** uma tabela `generation_events`
(user_id, kind, model, ok, latency_ms, cost_usd, error) escrita nos pontos que já têm
`console.log` de timing (`ai-chat/index.ts:1604, 1714`; `openrouter.ts:298` já devolve
`usage.cost`). Com isso um SELECT responde "o que quebrou ontem às 14h".

## A-5 — Upload para o Storage não tem retry: imagem paga que se perde

**Onde:** `supabase/functions/generate-slide-images/index.ts:1519-1529` —
`uploadBase64ToStorage` faz **um** `.upload()`; em erro, `throw`.
Chamado sem retry em `index.ts:425` e `index.ts:923`.

**O que acontece:** a imagem já foi gerada (já pagamos ao provedor), o upload falha por um
hiccup do Storage, e o slide volta `null`. No carrossel isso vira "3 de 5 slides"
(`ai-chat/index.ts:1804-1808`), e como a cobrança conta só os slides entregues
(`ai-chat/index.ts:1801` usa `imageUrls_arr.length`) o custo é **nosso**, integral.

**Correção:** 2 tentativas com backoff no upload — é a operação mais barata de re-tentar do
pipeline inteiro e a última do caminho caro.

## A-6 — `ai-agent` headless: 8 rodadas de tool sem orçamento de tempo

**Onde:** `supabase/functions/ai-agent/index.ts:277` — `for (let round = 0; round < 8; round++)`
no modo headless (o mesmo cap existe no SSE, `index.ts:337`).

Cada rodada pode disparar uma geração completa (50–103s). O loop não olha o relógio. Se o modelo
encadear 3 tools de geração, a invocação passa dos 300s e o runtime mata tudo — e aí cai no
cenário C-2 (re-cobrança). O cap de rodadas protege contra loop infinito, mas não contra
estouro de wall-clock.

**Correção:** orçamento de tempo (`if (Date.now()-t0 > 120_000) break`) além do cap de rodadas,
devolvendo o que já foi gerado.

---

# MÉDIO

## M-1 — `slideCount` sem teto no servidor

`supabase/functions/ai-chat/index.ts:1329` — `generationParams?.slideCount || 5`, sem clamp
superior. `clampSlides` (`_shared/content-validators.ts:24-31`) só corta **para baixo**.
O schema da tool diz `maximum: 10` (`_shared/agent-tools.ts:97`), mas isso é uma sugestão ao
LLM, não validação. Um caller com JWT válido pode pedir 30 slides → 30 imagens em `Promise.all`.
O front hoje limita (Studio fixa 5, `Studio.tsx:32`), então o risco imediato é baixo — mas é o
tipo de coisa que só aparece quando alguém empurra a API.
**Fix:** `Math.min(10, Math.max(2, slideCount))` no servidor.

## M-2 — Cron não está versionado no repositório

`grep 'cron.schedule|net.http_post' supabase/migrations/` → **zero resultados**. As migrations
criam `pg_cron` (`20260120175148_*.sql:2`) mas nenhum job. O `process-generation-jobs`, o
`instagram-scheduler` e o `credits-monthly-reset` dependem de agendamento configurado no painel
do Supabase — invisível no código, não revisável, não restaurável.
[NÃO CONFIRMADO: se os jobs existem hoje em produção e com qual frequência.]
**Risco direto:** se o cron do worker não existir, o `kick` fire-and-forget do front
(`useGenerationQueue.ts:77-81`, `.catch(() => {})`) é o **único** disparo — e um kick que falha
deixa o job `queued` para sempre.

## M-3 — `mintUserJwt` no laço sequencial do cron

`process-generation-jobs/index.ts:35-51` faz 2 chamadas à Admin Auth API (`generate_link` +
`verify`) **por usuário, por invocação**, dentro do laço sequencial `index.ts:145-151`. Com 10
usuários na fila: 20 chamadas de auth + 10 gerações completas, em sequência, numa invocação só.
Estoura o wall-clock muito antes de terminar — os últimos usuários da lista simplesmente não são
atendidos naquele tick, e o job do usuário em curso vira órfão (→ C-1/C-2).
[NÃO CONFIRMADO: o rate limit da Admin Auth API do Supabase para `generate_link`.]
**Fix:** processar os usuários em paralelo limitado (ex.: 3) e/ou disparar um `chainSelf` por
usuário **sem** processar no tick de varredura.

## M-4 — JWT do usuário expira durante uma fila longa

O caminho *kick* encadeia com o **JWT do usuário** (`process-generation-jobs/index.ts:118`,
`chainSelf(authHeader)`). Uma fila de 20 jobs × ~2min = 40min de encadeamento. Se o token vencer
no meio, o `ai-agent` devolve 401 e o job é marcado `failed` com a mensagem crua
`"ai-agent 401"` (`index.ts:66, 102`) — que é o que o usuário lê no painel.
**Fix:** no re-chain, trocar para o caminho interno (service key + `mintUserJwt`).

## M-5 — `enqueue` sem idempotência

`src/hooks/useGenerationQueue.ts:88-95` — INSERT direto, sem dedupe. Dois cliques = dois jobs =
duas gerações = duas cobranças. Não há debounce nem `disabled` durante o insert
(`AgentChat.tsx:349` só bloqueia por `sending`, que não cobre o enqueue).

## M-6 — Editorial: dois `Promise.all` encadeados sem limite

`ai-chat/index.ts:2120` (até 8 fotos geradas em paralelo) seguido de `index.ts:2142`
(até 8 renders em paralelo). São **duas** janelas longas em sequência dentro da mesma invocação.
O render tem 2 tentativas (`index.ts:2145`) — bom — mas a geração de foto não tem nenhuma
(`index.ts:2123-2138`, falha → `null`).

## M-7 — Legenda/variantes de plataforma sem retry e sem fallback

`ai-chat/index.ts:1699-1707` (carrossel) e `index.ts:1244-1259` (variantes): uma chamada só via
`aiGatewayFetch`; se o JSON não parsear, a legenda fica **vazia** e o produto entrega um post
sem texto (`index.ts:1698` — "legenda fica vazia"). É degradação silenciosa: o usuário recebe o
conteúdo, mas sem a legenda pela qual pagou.

## M-8 — `kick` fire-and-forget sem sinal de erro

`useGenerationQueue.ts:81` — `.catch(() => {})`. Se o worker devolver 500, ninguém sabe. O
comentário diz "o cron é a rede de segurança", o que só vale se M-2 estiver resolvido.

---

# BAIXO

## B-1 — `ActionCard` para de esperar em 5 min e marca falha

`src/components/chat/ActionCard.tsx:503-509`. Comportamento correto, mas o texto de falha não
diferencia "falhou" de "ainda gerando" — e para `render_mode: "ai_full_design"` ele marca
falha **imediatamente** se não houver imagem no DB (`ActionCard.tsx:493-499`), assumindo geração
síncrona. Se o carrossel virar assíncrono/incremental, essa heurística passa a mentir.

## B-2 — Anon key hardcoded no source

`src/hooks/useGenerationQueue.ts:25` e `src/pages/AgentChat.tsx`. Não é segredo (é pública por
design), mas duplica a fonte de verdade e complica rotação.

## B-3 — Circuit breaker do `inference.sh` é in-memory

`generate-slide-images/index.ts:151` (declaração), `:751` (leitura), `:825` (escrita) —
`inferenceShDownUntil` é uma variável de módulo. Cada
isolate tem a sua; com N isolates em paralelo, o circuito abre N vezes independentemente. Efeito
prático pequeno hoje (é Tier-2), mas o padrão não escala.

---

# O que já está BEM resolvido (não refazer)

Vale registrar, porque é bastante coisa e é boa engenharia:

| # | O que | Onde |
|---|---|---|
| 1 | **Retry transitório na imagem, respeitando `Retry-After`** — 429/5xx/rede re-tentam o **mesmo** modelo (2 tentativas, backoff), 400/401/403 não | `_shared/openrouter.ts:269-309` |
| 2 | **Fallback sem referências** quando o provedor rejeita a URL de referência — melhor imagem sem estilo que slide vazio | `_shared/openrouter.ts:311-319` |
| 3 | **Cobrança proporcional ao entregue** — carrossel cobra `imageUrls_arr.length`, não `slideCount`; post só cobra `if (imageUrl)` | `ai-chat/index.ts:1798-1801`, `1290-1294` |
| 4 | **Nunca cobra antes de entregar** — todos os 7 `chargeCredits` estão depois do save bem-sucedido | `ai-chat/index.ts:1294, 1801, 2021, 2186, 2263, 2433` |
| 5 | **Reaper com limite de tentativas** na claim (o mecanismo existe; falta o gatilho — C-1) | `migrations/20260726130000_claim_next_job_reaper.sql` |
| 6 | **Lock otimista no scheduler** que matou o bug dos 12 posts duplicados do Felipe, incluindo o `publish_attempts` no SELECT | `instagram-scheduler/index.ts:27-37, 59-71` |
| 7 | **Reconciliação de publicações `processing`** consultando o PFM e resolvendo published/failed | `instagram-scheduler/index.ts:259-301` |
| 8 | **Cadeia de fallback de imagem em 3 tiers** (OpenRouter → Replicate → inference.sh) + circuit-break de saldo | `generate-slide-images/index.ts:722-770` |
| 9 | **Chain de modelos no texto** com fallback automático Haiku→Gemini→Qwen, e backstop Replicate se o OpenRouter inteiro cair | `_shared/openrouter.ts:137-161`, `ai-agent/index.ts:133-153` |
| 10 | **Retry da capa-âncora** do carrossel — se a âncora falha, o carrossel inteiro sai inconsistente, então ela re-tenta 1× | `ai-chat/index.ts:1624-1632` |
| 11 | **`requireAuth`** blindando as funções `verify_jwt=false`, com distinção interno/usuário e proibição de confiar no `body.userId` | `_shared/require-auth.ts` |
| 12 | **1 job `processing` por usuário** — um usuário não monopoliza o worker | `migrations/20260726130000_*.sql` |
| 13 | **Human-in-the-loop preservado na fila** — publicar/agendar nunca roda sozinho, devolve `needs_review` | `ai-agent/index.ts:292-295` |
| 14 | **Pré-checagem de saldo real nas tools do agente** (não depende de flag) | `_shared/agent-tools.ts:438, 529, 655, 714` |
| 15 | **Realtime na fila e nos créditos** — status muda sem refresh | `useGenerationQueue.ts:49-70`, `migrations/20260621120000_user_credits_realtime.sql` |
| 16 | **Rollback de conversa no `/agent`** se o stream morrer antes do `done` — falha não envenena os turnos seguintes | `src/pages/AgentChat.tsx:283, 316-320` |
| 17 | **`tfetch` com AbortController** nas chamadas ao Replicate, com a pegadinha do `res.json()` documentada | `_shared/openrouter.ts:95-100`, `generate-slide-images/index.ts:199-210` |
| 18 | **Polling do PFM com timeout por tentativa** (5s) e resolução explícita de `pending` | `publish-postforme/index.ts:287-330` |

---

# Ordem sugerida de correção

Ordenado por (severidade × chance de acontecer no 1º mês de tráfego real):

| Ordem | Item | Esforço | Por quê agora |
|---|---|---|---|
| 1 | **C-2** débito idempotente por `job_id` | P | Reembolso é o pior ticket possível no dia 1 |
| 2 | **C-1** varredura global de `processing` no cron + policy de cancelar | P | Acontece na primeira geração longa |
| 3 | **C-3** reconciliar `publishing` travado | P | Silencioso: descobre só quando o cliente reclama que não postou |
| 4 | **A-1** ligar `CREDITS_ENFORCED` | PP | Um secret. Ralo de custo aberto |
| 5 | **C-4** pool de concorrência nas imagens | M | Só morde com simultaneidade — mas morde forte |
| 6 | **A-4** tabela `generation_events` | M | Sem isso, nenhum dos itens acima é diagnosticável depois do fato |
| 7 | **A-3** timeout + mensagem útil no front | P | Muda a percepção de "quebrado" para "demorando" |
| 8 | **A-5** retry no upload | PP | 5 linhas, salva imagem já paga |
| 9 | **M-2** versionar o cron em migration | P | Torna o resto auditável |
| 10 | **A-6 / M-1 / M-3 / M-4** limites de tempo e de tamanho | M | Endurecimento; depois dos anteriores |

---

# 9. O que NÃO foi confirmado

Explícito, para não virar afirmação por omissão:

- **Valor exato do wall-clock** da edge no plano atual do projeto. Usei os 150–400s que o próprio
  código assume.
- **Se `CREDITS_ENFORCED=true` está setado em produção.** O default no código é `false`; os
  secrets não são legíveis daqui.
- **Se os cron jobs existem em produção** e com qual frequência — não há nenhum
  `cron.schedule` no repositório.
- **Rate limits reais** que estamos batendo hoje no OpenRouter/PFM — não há registro de 429 em
  lugar nenhum (é consequência direta de A-4).
- **Se o timeout do gateway do Supabase devolve 504 antes do wall-clock da função** — o
  comentário em `_shared/openrouter.ts:277` sugere que sim ("arriscaria o 504 do carrossel"), mas
  não há medição registrada.
- **Comportamento do `supabase.functions.invoke` em requisição >150s** no browser — não há
  timeout explícito no cliente, então depende do gateway e do browser.
- **Não auditei**: `generate-content` (1361 linhas; o front só menciona a string em
  `FeatureGuide.tsx:45` como chave de tutorial, nenhuma invocação — provável legado, mas a função
  segue deployada), `generate-template-sets`, `generate-download`, `search-images`,
  `analyze-brand-examples`, `fetch-social-metrics`, `redeem-coupon`. Fora do caminho quente de
  geração/publicação descrito no escopo.

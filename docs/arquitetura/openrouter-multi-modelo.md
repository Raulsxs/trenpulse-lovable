---
tags: [arquitetura, pulse-id, trendpulse]
projeto: TrendPulse
autor: Raul
data: 2026-07-26
status: pronto-pra-executar   # rascunho | pronto-pra-executar | em-execucao | entregue
operador: Raul (via Claude Code)
repo: Raulsxs/trenpulse-lovable
---

# Arquitetura de Solução — OpenRouter como camada multi-modelo de geração (texto/agente + imagem + vídeo) + telemetria de margem

> **O que é:** trocar a stack de IA de "N integrações frágeis" (Anthropic direto + Replicate + inference.sh + Gemini, cada uma um ponto único de falha) por **uma camada unificada via OpenRouter**, que expõe 301 modelos de texto (tool-calling nativo), 38 de imagem e 17 de vídeo numa API só, com **custo real em USD no `usage` de cada chamada**. Isso conserta de verdade os apagões recentes, protege a margem do modelo de crédito e destrava a ambição de oferecer vários modelos ao usuário.

## 1. O que precisa funcionar (a capacidade)

Quando esta capacidade estiver pronta:
- O **agente não cai** quando um provedor falha — roteia entre modelos (Haiku → Gemini Flash → Qwen) via OpenRouter, com **tool-calling nativo** (fim do remendo de tool-calling manual via Replicate).
- Cada geração (texto, imagem, vídeo) **registra o custo real em USD**, e o admin vê **margem por operação e por modelo** num painel.
- O usuário escolhe entre **vários modelos de imagem** (e, no Business, vídeo) por um seletor **curado por objetivo** — não por slugs técnicos.
- **Vídeo é reprecificado** para nunca dar prejuízo.

## 2. Estado atual (o que já existe)

- **Cérebro do agente:** `supabase/functions/ai-agent/index.ts` — loop de tool-calling manual (formato Anthropic: `content` blocks, `tool_use`/`tool_result`). Hoje `agentTurn()` tenta o SDK Anthropic (`claude-haiku-4-5`) e, em qualquer falha, cai pro **fallback Replicate** (`_shared/agent-fallback.ts`, tool-calling emulado por JSON manual — remendo desta semana porque a `ANTHROPIC_API_KEY` zerou). Tem 2 modos: SSE (stream) e `headless` (fila).
- **Geração de imagem:** `supabase/functions/generate-slide-images/index.ts` — Tier-1 **Replicate** (`callReplicate`, registry `REPLICATE_REGISTRY` com gpt-image-2, nano-banana, seedream, flux, reve, ideogram, recraft, qwen, imagen), Tier-2 **inference.sh** (hoje 402/sem saldo → `inferenceShDownUntil` circuit breaker), Tier-3 Gemini do usuário / Lovable Gateway. Helper `tfetch` (timeout) já existe.
- **Geração de texto/legenda:** `_shared/ai-gateway.ts` — Replicate Haiku primário (`fetchClaudeReplicate`), com fixDoubleEncodedUtf8.
- **Vídeo:** `supabase/functions/generate-video/index.ts` — só Grok/Kling hoje.
- **Billing/crédito:** `user_credits`, `credit_ledger`, `credit_pricing` (custo em cr por operação), RPCs `grant_credits`/`spend_credits`. Usuário paga **~R$0,10/cr** (packs em `create-credit-charge`: R$50=500cr … R$200=2200cr). Cobrança acontece no `ai-chat`/`ai-agent`.
- **Admin:** `supabase/functions/admin-analytics/index.ts` + `src/components/.../AdminAnalytics.tsx` (KPIs, custos, usuários — restrito ao dono).
- **Fila de gerações:** `generation_jobs` + `process-generation-jobs` (worker headless) — recém-entregue, consome o `ai-agent` headless.
- **Seletor de modelo (front):** `MODELS` em `src/pages/AgentChat.tsx` — 3 tiers (Econômico=seedream / Padrão=gpt-image-2 / Premium=nano-banana).

## 3. A solução desenhada (a forma)

### 3.1 Cliente OpenRouter compartilhado — `_shared/openrouter.ts` (fundação de tudo)
Um módulo único que fala com a API do OpenRouter e **isola o resto do código das diferenças de provedor**:

- **`orChat({ system, messages, tools, modelChain, stream, onText })`** — chama `POST /api/v1/chat/completions`. Recebe **mensagens no formato Anthropic** (o que o `ai-agent` já usa) e **traduz p/ formato OpenAI** (tool_use→tool_calls, tool_result→role:"tool", content blocks→string/parts) na entrada, e **traduz a resposta de volta p/ formato Anthropic** (`{ content: blocks, stop_reason }`) na saída. Assim **o loop do `ai-agent` não muda** — só troca quem faz a chamada.
  - **modelChain**: lista ordenada, ex.: `["anthropic/claude-haiku-4.5", "google/gemini-2.5-flash", "qwen/qwen3.5-flash-02-23"]`. Tenta o 1º; em 429/5xx/timeout/erro de provedor, cai pro próximo. Tudo com tool-calling **nativo** (validado ao vivo: Haiku retornou `tool_calls` correto, custo $0.0009/turno).
  - **stream**: quando `true`, consome o SSE do OpenRouter e emite texto por `onText` (preserva o streaming do chat interativo). Quando `false` (headless/fila), retorna de uma vez.
  - **retorna também `usage`** (inclui `cost` em USD real) — insumo da telemetria (§3.3).
- **`orImage({ model, prompt, aspectRatio, refImages, size })`** — chama `POST /api/v1/images` (Unified Image API). Normaliza a resposta (base64/URL) igual ao `callReplicate` já faz. Retorna imagem + `usage.cost`.
- **`orVideo({ model, prompt, imageUrl, durationSeconds, resolution })`** — chama a Videos API (submit + poll). Retorna URL do vídeo + custo.
- **Segredo:** `OPENROUTER_API_KEY` como secret do Supabase (NUNCA commitado). Header `Authorization: Bearer` + `HTTP-Referer`/`X-Title` (boa prática OpenRouter).

### 3.2 P0 — Cérebro do agente no OpenRouter
Em `ai-agent`, `agentTurn()` passa a: **1º** `orChat` com `modelChain` (Haiku nativo → Gemini Flash → Qwen); **2º**, só se o OpenRouter inteiro falhar, o `agent-fallback.ts` (Replicate manual-JSON) como **última rede**. O SDK Anthropic direto sai do caminho quente (fica opcional se um dia recarregar). Vale p/ os dois modos (SSE e headless). O `agent-fallback.ts` **não é removido** — vira o backstop final.

### 3.3 P0.5 — Telemetria de custo real por geração
Nova tabela **`generation_costs`**: `id, user_id, op (post/carousel_slide/story/agent_turn/video…), provider (openrouter/replicate/…), model (slug), credits_charged INT, real_cost_usd NUMERIC, generation_id UUID?, metadata JSONB, created_at`. RLS: só `service_role` escreve; SELECT restrito ao dono (admin lê tudo via service). Instrumentar os pontos de geração (`ai-chat`, `ai-agent`, `generate-slide-images`, `generate-video`) pra gravar o `usage.cost` sempre que a chamada passa pelo OpenRouter (fire-and-forget, nunca derruba a geração). No `admin-analytics`, uma view de **margem**: por operação e por modelo → `receita (cr×R$0,10) − custo (USD×câmbio)` = margem %, com alerta pra qualquer op < X%.

### 3.4 P1 — Camada multi-modelo de imagem + UX curada
- `generate-slide-images`: adicionar `orImage` como **provider** (novo tier, ao lado do Replicate) e habilitar 2-3 modelos novos que não temos: **FLUX.2 Klein** (econômico, $0,014/MP), **Recraft v4.1 vetorial** (logo/ícone/SVG). Entradas novas em `credit_pricing` **com o custo real medido** (§3.3) antes de precificar.
- **UX curada:** evoluir o `MODELS` (front) de 3 tiers pra **grupos por objetivo** — "Melhor texto pt-BR", "Mais rápido/barato", "Logo/Vetorial", "Fotorrealista". O usuário escolhe pelo *resultado*, o backend mapeia p/ o slug real. **Nunca** expor 38 slugs crus.

### 3.5 P2 — Vídeo (Business) com repricing obrigatório
- **Antes de qualquer código:** Raul define os novos preços em crédito por faixa de vídeo (o atual `video_5s`=45cr = R$4,50 dá **prejuízo** com Veo/Sora ~$0,70/5s = R$3,85 → margem 14%). Provável: faixas por modelo (econômico Hailuo/Grok vs premium Veo/Sora) e por duração.
- `generate-video`: adicionar `orVideo` (Veo 3.1 / Sora 2 Pro / Kling v3 / Seedance / Hailuo), gated ao plano Business.

## 4. Fora de escopo (anti-alucinação — OBRIGATÓRIO)

- **NÃO remove o Replicate** — ele continua como provider/fallback de imagem e como backstop do agente (`agent-fallback.ts`). Nada de "migrar tudo e apagar o legado".
- **NÃO mexe em Post for Me / publicação / agendamento.**
- **NÃO faz BYOK por usuário** (chave OpenRouter por cliente) — é uma chave única do app.
- **NÃO faz o refactor de geração async (submit+poll)** — é débito técnico separado (nota do projeto).
- **NÃO mexe nos packs de recarga / Asaas** — o preço do crédito em R$ fica como está.
- **NÃO quebra o fluxo `photo_backgrounds` do Maikon** — o caminho de imagem dele é sagrado; rastrear ponta a ponta antes de tocar em `generate-slide-images`.
- **NÃO expõe seletor de vídeo fora do Business.**

## 5. Riscos / pegadinhas / dependências

- **Tradução de formato Anthropic ↔ OpenAI** é a parte mais delicada: mapear `tool_use`/`tool_result` (multi-turn), `is_error`, e blocos de imagem. Precisa de teste unitário cobrindo um loop com 2 rodadas de tool. Se errar, o agente entra em loop ou perde contexto.
- **Streaming:** o chat interativo depende de token-a-token (`onText`). O OpenRouter suporta SSE, mas o parsing muda — validar que o stream continua fluido.
- **OpenRouter vira dependência.** Mitigação: `agent-fallback.ts` (Replicate) permanece como última rede; e dá pra BYOK chave Anthropic/Google direto se precisar. Nunca deixar o OpenRouter ser um novo ponto único.
- **Custo por token variável** (modelos Gemini/GPT de imagem): NUNCA precificar um modelo novo sem antes medir o custo real (§3.3). O vídeo a 45cr é a lição — repriecing é **gate de negócio**, decisão do Raul.
- **Câmbio USD→BRL** comprime margem (custo em USD, receita em BRL). A telemetria deve usar um câmbio configurável.
- **A key OpenRouter apareceu no chat** desta sessão → **rotacionar** e guardar só como secret do Supabase; nunca no git/Vault.
- **`verify_jwt`:** funções internas novas (se houver) precisam entrar no `config.toml` com `verify_jwt=false` (padrão do projeto — a service key é `sb_secret_*`, não JWT).
- **Ordem obrigatória:** T01 (cliente) antes de tudo; T03 (telemetria) antes de T05/T07 (precificar modelo novo exige medir custo).

## 6. Plano de Execução — as tarefas (cada item = 1 PR)

- [x] **T01 (P0) — `_shared/openrouter.ts`**: cliente `orChat` com tradução Anthropic↔OpenAI, tool-calling nativo, `modelChain` com fallback, streaming, e retorno de `usage.cost`. Teste unitário da tradução (11 testes) + validação ao vivo (round-trip do loop de tool com Haiku via OpenRouter, custo $0.0009). `OPENROUTER_API_KEY` como secret. ✅
- [ ] **T02 (P0) — Agente no OpenRouter**: `ai-agent` `agentTurn()` usa `orChat` (Haiku→Gemini→Qwen) com `agent-fallback.ts` (Replicate) como última rede. Preserva SSE + headless. Deploy + teste ao vivo (chat responde + gera post ponta a ponta via OpenRouter, com a Anthropic direta ainda zerada).
- [ ] **T03 (P0.5) — Telemetria**: migration `generation_costs` (+RLS) e instrumentação de `ai-agent`/`ai-chat`/`generate-slide-images` p/ gravar `usage.cost` (fire-and-forget).
- [ ] **T04 (P0.5) — Painel de margem**: `admin-analytics` + UI mostrando receita×custo real por operação e por modelo, com alerta de margem baixa.
- [ ] **T05 (P1) — Provider de imagem OpenRouter**: `orImage` em `generate-slide-images` como tier novo + FLUX.2 Klein (econômico) e Recraft vetorial; `credit_pricing` com custo medido. Não quebrar o caminho do Maikon.
- [ ] **T06 (P1) — UX curada de modelos**: seletor por objetivo no front (evolui `MODELS`), mapeando rótulo→slug; incluir os modelos novos.
- [ ] **T07 (P2) — Vídeo + repricing**: Raul define os preços; `orVideo` (Veo/Sora/Kling/Hailuo) em `generate-video`, gated ao Business; `credit_pricing` de vídeo refeito.

## 7. Critério de pronto (verificável)

- [ ] Cada tarefa T01–T07 com **1 PR** aprovado pelo Raul; `npx vite build` verde e `npm test` verde a cada PR; deploy das edge functions via CLI.
- [ ] **P0:** com a `ANTHROPIC_API_KEY` direta zerada, o chat interativo responde E um post é gerado ponta a ponta usando `anthropic/claude-haiku-4.5` **via OpenRouter** (tool-calling nativo, confirmado no log). Derrubando o Haiku (forçando erro), o agente cai pro Gemini/Qwen e ainda funciona.
- [ ] **P0.5:** cada geração grava uma linha em `generation_costs` com `real_cost_usd`; o painel de margem mostra a margem por operação e sinaliza qualquer op abaixo do piso.
- [ ] **P1:** o usuário gera com pelo menos 2 modelos novos (FLUX Klein e Recraft vetorial) pelo seletor curado; fluxo `photo_backgrounds` do Maikon segue intacto (teste de regressão).
- [ ] **P2:** nenhum preço de vídeo tem margem negativa no painel; geração de vídeo via OpenRouter funciona no Business.

## 8. Autonomia e direitos de decisão

- **Operador (Claude Code) decide sozinho:** como implementar cada tarefa dentro deste desenho; a ordem fina; os detalhes de tradução de formato; quais modelos de fallback exatos na chain.
- **Volta pro Raul só em:** definição de **preços** (crédito por modelo novo e por vídeo — decisão de negócio) · quais modelos **expor** ao usuário na UX curada · bloqueio real · capacidade concluída.
- **Mergeia:** Raul, revisando cada PR (portão de qualidade). Babysit pós-PR até CI verde.

## 9. Checklist de revisão (Raul, antes de `pronto-pra-executar`)

- [ ] **Permissões:** telemetria e painel de margem restritos ao dono/admin; `generation_costs` só service_role escreve.
- [ ] **Casos de erro mapeados:** OpenRouter 429/5xx/timeout (→ fallback na chain), falha total do OpenRouter (→ Replicate backstop), custo ausente no `usage` (→ grava null, não quebra), modelo de imagem que devolve URL vs base64, vídeo que estoura wall-clock (→ submit+poll/async).
- [ ] **Decisões de negócio explícitas:** preço em crédito de cada modelo novo (medir antes) · faixas de preço de vídeo · câmbio USD→BRL usado na margem · piso de margem que dispara alerta. **Essas são do Raul, não da IA.**
- [ ] **Critérios de pronto (§7) verificáveis** — sim (log de tool-calling nativo, linha em `generation_costs`, margem no painel, regressão Maikon).
- [ ] **Caso fora do óbvio tratado:** fallback quando o provedor primário cai no meio do loop; retry que não pode cobrar 2x o mesmo crédito; concorrência da fila (já resolvida pelo worker) somada ao roteamento.
- [ ] Um operador começaria a **T01** sem voltar pra perguntar escopo.

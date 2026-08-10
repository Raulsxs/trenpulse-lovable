---
tags: [template, arquitetura, pulse-id]
projeto: TrendPulse
autor: Raul
data: 2026-07-09
status: rascunho   # rascunho | pronto-pra-executar | em-execucao | entregue
operador: Raul
repo: Raulsxs/trenpulse-lovable
---

# Arquitetura de Solução — Memória do Usuário (Fase 1)

> **O que é:** uma camada de memória APRENDIDA e evolutiva do usuário (estilo memória do Claude/ChatGPT). A IA observa o comportamento real do usuário, extrai um perfil durável e injeta esse perfil em toda geração — deixando o conteúdo mais alinhado sem o usuário repetir preferências. É a FUNDAÇÃO da futura camada de inteligência editorial (Fase 2: memória × tendências = pautas personalizadas, o gap competitivo vs Qorvo).

## 1. O que precisa funcionar (a capacidade)

Quando esta capacidade estiver pronta, o TrendPulse **lembra de cada usuário sem ele repetir nada**: sabe quem ele é (profissão, clientes-chave, conquistas), como ele gosta do conteúdo (preferências visuais, tom, edições que sempre pede — ex.: "menos texto") e sobre o que ele realmente posta. Esse perfil é atualizado sozinho a partir do uso e entra em toda geração, resultando em conteúdo mais certeiro e menos "refazer". O usuário consegue VER e corrigir o que a IA aprendeu.

## 2. Estado atual (o que já existe)

Matéria-prima crua JÁ existe — falta só o cérebro que aprende:

- **`ai_user_context`** (Postgres): `business_niche`, `brand_voice`, `content_topics`, `instagram_handle`, `extra_context` (JSONB). Contexto ESTÁTICO, preenchido no onboarding, quase nunca muda.
- **`agent_message_log`** (Postgres): cada turno do agente (user + assistant + tool_calls + image_count). Ligado em jul/2026. É o principal sinal de comportamento — hoje ninguém lê pra aprender.
- **`generated_contents`**: título, caption, slides, `status` (draft/approved/published/rejected), `generation_metadata` (inclui `prompt`, `action`). Aprovar/rejeitar/editar são sinais fortes de preferência.
- **`brands`** / **`brand_examples`**: identidade visual (paleta, fontes, regras, `style_guide`, `creation_mode`).
- **Injeção de contexto na geração — JÁ EXISTE:** `supabase/functions/_shared/brand-context.ts` (`buildBrandContext`) monta o bloco de marca; `ai-chat/index.ts` e `_shared/agent-tools.ts` injetam esse bloco no prompt de imagem/legenda. A memória vai "pegar carona" nesse mesmo ponto de injeção.
- **Cron existente como referência:** `instagram-scheduler` roda via `pg_cron` (`*/5 * * * *`) chamando a edge function por `net.http_post`. O cron da memória segue o mesmo padrão.
- **Motor de texto:** Claude Haiku (`_shared/ai-gateway.ts`, `USE_CLAUDE_TEXT` / Replicate) — usado pra extração (barato).

## 3. A solução desenhada (a forma)

Loop clássico de memória: **observa → extrai → guarda → injeta → refina.**

### 3.1 Armazenamento — tabela `user_memory`
```
user_memory (
  user_id           uuid PK,
  identidade        jsonb,   -- quem é: profissão, clientes-chave, conquistas, cidade, formação
  preferencias      jsonb,   -- como gosta: {visual:[...], tom:[...], edicoes_recorrentes:[...], modo_preferido, formatos_favoritos}
  temas             jsonb,   -- sobre o que posta de verdade (extraído das gerações, não do onboarding)
  resumo            text,    -- 1 parágrafo pronto pra injetar no prompt (versão compacta das 3 camadas)
  last_extracted_at timestamptz,
  updated_at        timestamptz default now()
)
```
- **RLS:** usuário faz SELECT/UPDATE só da própria linha; escrita da extração via `service_role`.
- **Cap de tamanho:** `resumo` limitado (~800 chars) pra não inflar o prompt. As camadas JSONB guardam o detalhe; o `resumo` é o que entra na geração.

### 3.2 Extração — edge function `extract-user-memory` (cron diário)
Fluxo (para cada usuário com atividade desde `last_extracted_at`):
1. **Monta o dossiê bruto** (service_role): últimos ~30 turnos de `agent_message_log` + últimas ~20 `generated_contents` (título, status, `generation_metadata.prompt`, edições) + `ai_user_context` + nomes das `brands`.
2. **LLM (Haiku) extrai** num prompt de extração que devolve JSON com as 3 camadas + `resumo`. Regra dura anti-alucinação: **só fatos com evidência no dossiê**; nada de inventar. Preferir observações repetidas (ex.: pediu "menos texto" 3×) a eventos únicos.
3. **MERGE incremental** (não sobrescreve): a nova extração ATUALIZA a memória existente — reforça o que se repete, adiciona o novo, não apaga o antigo sem sinal. Grava em `user_memory`, atualiza `last_extracted_at`.

### 3.3 Injeção — na geração e no agente
- Em `ai-chat`/`agent-tools`, no mesmo ponto onde `buildBrandContext` é injetado, ler `user_memory.resumo` e adicionar um bloco `PERFIL APRENDIDO DO USUÁRIO: <resumo>` ao prompt de imagem/legenda.
- No system prompt do `ai-agent`, injetar o mesmo resumo pra o agente conversacional "conhecer" o usuário desde o primeiro turno.
- **Flag `USE_USER_MEMORY`** pra ligar/desligar sem redeploy (segurança de rollout).

### 3.4 Transparência — UI no Perfil
Uma seção "O que a IA aprendeu sobre você" em `src/pages/Profile.tsx` que mostra as 3 camadas e deixa o usuário **editar/remover** itens. Fundamental pra confiança (e LGPD): o usuário controla a própria memória.

## 4. Fora de escopo (anti-alucinação — OBRIGATÓRIO)

- **Tendências / scrape-trends** — está desligado/inexistente no repo. A camada memória × tendências é Fase 2, arquitetura à parte.
- **Sugestões proativas / "pautas da semana"** (Fase 3) — não entra aqui.
- **Gatilho em tempo real / "fim de sessão"** — não existe evento de fim de sessão hoje; Fase 1 usa só cron diário. Trigger event-driven fica pra depois.
- **Aprendizado entre usuários** (o que funciona no nicho X pra todos) — não; memória é 100% por-usuário.
- **Mudança no fluxo de geração/publicação** — a memória só ADICIONA contexto ao prompt; não altera modelos, custos ou o pipeline.

## 5. Riscos / pegadinhas / dependências

- **Privacidade/LGPD:** a memória pode capturar dado sensível (saúde, clientes). Mitigação: UI de edição/remoção (§3.4), RLS estrita, e NÃO logar a memória em lugar versionado.
- **Memória errada/estagnada:** extração pode inferir errado. Mitigação: só fatos com evidência + repetição, MERGE incremental (não sobrescreve cego), e a UI de correção.
- **Inflar o prompt:** injetar memória grande degrada/encarece a geração. Mitigação: injetar só o `resumo` (~800 chars), não as camadas cruas.
- **Custo da extração:** Haiku × usuários × dia. Mitigação: só usuários COM atividade nova (filtro `last_extracted_at`), dossiê limitado (30 turnos/20 gerações), Haiku (barato).
- **Ordem obrigatória:** injeção (T05) depende da tabela (T01) e de haver memória gravada (T02-T04). A UI (T06) depende da tabela.
- **Regressão no brand context:** a injeção da memória entra JUNTO do `buildBrandContext` — não pode quebrar o bloco de marca existente (testar geração com e sem memória).
- **Dependência:** `pg_cron` + `net.http_post` já configurados (mesmo mecanismo do `instagram-scheduler`).

## 6. Plano de Execução — as tarefas (cada item = 1 PR)

- [ ] **T01 — Migration `user_memory`** — tabela (colunas do §3.1) + RLS (user select/update própria linha; service_role escreve) + índice por `user_id`. Aplicar em prod.
- [ ] **T02 — Edge function `extract-user-memory` (coleta)** — monta o dossiê bruto por usuário (agent_message_log + generated_contents + ai_user_context + brands), filtrando por atividade desde `last_extracted_at`. Sem LLM ainda — só o dossiê + log.
- [ ] **T03 — Extração via Haiku + MERGE** — prompt de extração (3 camadas + resumo, anti-alucinação), chama Haiku, faz merge incremental na `user_memory`, atualiza `last_extracted_at`. Cap de tamanho no `resumo`.
- [ ] **T04 — Cron diário** — `pg_cron` chamando `extract-user-memory` 1×/dia (padrão do `instagram-scheduler`). `config.toml` com `verify_jwt=false`.
- [ ] **T05 — Injeção na geração + agente** — ler `user_memory.resumo` e injetar bloco `PERFIL APRENDIDO` no prompt de imagem/legenda (ai-chat + agent-tools) e no system prompt do `ai-agent`. Atrás da flag `USE_USER_MEMORY`.
- [ ] **T06 — UI de transparência no Perfil** — seção "O que a IA aprendeu sobre você" com visualização das 3 camadas + editar/remover itens (grava em `user_memory`).
- [ ] **T07 — Sinais de edição recorrente** — enriquecer a extração lendo `generation_metadata` / EDIT_CONTENT pra capturar edições que se repetem (ex.: "menos texto", "cores mais vibrantes") em `preferencias.edicoes_recorrentes`.
- [ ] **T08 — Validação e-2-e + métrica** — gerar com memória ligada num usuário real (ex.: Maikon), confirmar que o `resumo` entra no prompt e o conteúdo reflete; medir taxa de "refazer/editar" antes vs depois.

## 7. Critério de pronto (verificável)

- [ ] Cada tarefa T01–T08 com PR aprovado e mergeado.
- [ ] `user_memory` existe em prod com RLS (usuário só vê a própria).
- [ ] Cron roda 1×/dia e popula `user_memory` de usuários com atividade (verificável na tabela).
- [ ] Com `USE_USER_MEMORY=true`, o bloco `PERFIL APRENDIDO` aparece no prompt final da geração (log) e o agente cita algo da memória.
- [ ] No Perfil, o usuário vê a memória aprendida e consegue editar/remover um item (persiste).
- [ ] `npm test` verde + `deno check` nas functions tocadas + build Vercel verde.

## 8. Autonomia e direitos de decisão

- **Operador (Raul) executa** as tarefas T01–T08 em ordem, 1 PR por tarefa, revisando cada uma.
- **Decisões já fixadas:** cron diário (não event-driven); memória por-usuário; injeta só o `resumo`; flag de rollout; UI de transparência obrigatória.
- **Volta pra decisão de produto só em:** formato final das 3 camadas se mudar muito na prática; política de retenção/LGPD da memória.

## 9. Checklist de revisão (antes de `pronto-pra-executar`)

- [ ] **Permissões:** RLS definida (usuário só a própria memória; service_role escreve). ✅ desenhado
- [ ] **Casos de erro:** usuário sem atividade (pula), extração retorna JSON inválido (não sobrescreve), memória vazia (geração segue normal sem o bloco), flag desligada (comportamento atual intacto). — revisar na execução
- [ ] **Decisões de negócio:** gatilho (cron), granularidade (por-usuário), transparência (UI editável), tamanho injetado (resumo). ✅
- [ ] **Critérios verificáveis (§7):** contratos ("bloco aparece no prompt", "cron popula a tabela"), não "está bom". ✅
- [ ] **Caso fora do óbvio:** memória errada → UI de correção; prompt inflado → cap no resumo; custo → filtro por atividade. ✅
- [ ] **Júnior começaria T01 sem perguntar escopo?** Sim — schema e RLS estão no §3.1.

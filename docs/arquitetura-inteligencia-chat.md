# Inteligência do chat/agente — avaliação e direção

> Avaliação da estrutura atual do Assistente (ai-agent) e um plano pra dois eixos que o Raul levantou
> (18/jul): (1) inteligência proativa de intenção + base de conhecimento por cliente; (2) continuidade
> contextual — usar o que já foi gerado como insumo do próximo passo.

## O que a arquitetura JÁ entrega (grounded no código)

- **Contexto por usuário (raso):** `ai_user_context` (nicho, tom, temas, @) + lista de marcas →
  injetados no system prompt como um "perfil de 1 linha" (`ai-agent/index.ts:buildSystemPrompt`).
- **Continuidade dentro da conversa:** o agente reusa a **última geração** por `content_id` (aparece
  como `content_id=...` nos resultados das tools) com fallback pra "última geração do usuário":
  `adaptar_para_rede`, `editar_conteudo`, `editar_legenda`, `mostrar_conteudo`. Adaptar/editar/publicar
  o que já foi gerado **funciona**.
- **Anexos da mensagem atual** viram mídia/referência via `ctx.pendingImageUrls`.
- **Gating** (confirmação) só para publicar/agendar.
- **Auditoria:** `agent_message_log` guarda cada turno (role, content, tool_calls) — mas **NÃO é lido
  de volta** como memória (é só auditoria).

## Gaps (os 2 pontos)

### Ponto 2 — usar imagem gerada como insumo do próximo passo
- Antes: ❌ a mídia de tweet card vinha só de UPLOAD; não dava pra "pega a imagem que gerei e usa no
  tweet card". As URLs das gerações não circulavam como assets reutilizáveis.
- ✅ **Começado (frente #1):** `gerar_tweet_card` agora aceita `usar_imagem_gerada`/`source_content_id`
  → reaproveita a última geração com imagem (padrão do `adaptar_para_rede`) como mídia do card, sem
  pedir upload. É o primeiro passo do "registro de assets da sessão".
- Falta generalizar: outras tools aceitarem imagem-fonte (ex.: gerar_post a partir de uma geração
  anterior como referência) e um "registro de assets" explícito da sessão.

### Ponto 1 — inteligência proativa + base de conhecimento
- Contexto é estático (1 linha). **Não aprende** (preferências de estilo, formatos que o cliente curte,
  correções recorrentes). `agent_message_log` é a matéria-prima, mas não vira memória.
- O agente é **enviesado a AGIR** (prompt: "CHAME A FERRAMENTA, não descreva"). **Não sugere melhorias**
  ("quer subir uma imagem pra esse tweet card ficar melhor?"). Falta **postura consultiva**.

## Direção (faseada)

| # | Frente | Resolve | Esforço | Status |
|---|---|---|---|---|
| 1 | **Continuidade de assets** — geração vira insumo reutilizável; tools aceitam imagem-fonte | Ponto 2 | Médio | 🟡 iniciado (tweet card a partir de imagem gerada) |
| 2 | **Postura consultiva pontual** — 1 sugestão de alto valor em casos claros (tweet card sem mídia → "quer usar a última imagem que você gerou / subir uma?") | Ponto 1 | Baixo | ❌ |
| 3 | **Memória viva por cliente** — perfil que aprende do `agent_message_log` (preferências, correções) e entra no prompt | Ponto 1 | Médio-alto | ❌ |

### Ressalvas honestas
- **Proatividade tem tradeoff:** perguntar demais irrita. Régua: só pergunta quando o ganho é claro e
  a resposta MUDA o resultado (não como default).
- **Memória viva** tem custo + privacidade + risco de "aprender errado" → precisa ser curada e
  transparente ("aprendi que você prefere X").

## Próximos passos sugeridos
1. Terminar a **#1**: registro de assets da sessão (o agente enxerga as URLs das últimas gerações) +
   generalizar imagem-fonte pra gerar_post.
2. **#2** (barato, efeito imediato): o agente oferece usar/subir imagem quando um tweet card sairia
   melhor com mídia.
3. **#3** (o salto de inteligência): memória por cliente derivada do histórico.

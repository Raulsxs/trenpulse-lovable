# TrendPulse — Plano de Simplificação Total

## Visão: "Gemini com contexto de marca + publicação direta"

O usuário digita no chat → TrendPulse injeta contexto da marca → Gemini gera imagem → Resultado com Aprovar/Agendar/Publicar.
Sem wizard. Sem steps. Sem modos visuais.

---

## Backup

- Branch: `backup/pre-simplification` (todo o código atual)
- Pode ser restaurado a qualquer momento com `git checkout backup/pre-simplification`

---

## Arquitetura Nova

### Fluxo de geração (1 step)

```
Usuário digita → ai-chat classifica intent
  ├─ GENERATE_IMAGE → monta prompt + marca → Gemini gera imagem → minimax gera legenda → salva → ActionCard
  ├─ GENERATE_CAROUSEL → mesmo, mas N slides sequenciais
  ├─ EDIT_CONTENT → imagem atual + instrução do usuário → Gemini regenera
  ├─ CREATE_BRAND → fluxo de criação de marca (simplificado)
  └─ CHAT → minimax responde (conversa livre)
```

### Frontend simplificado

```
Chat Input Bar:
┌─────────────────────────────────────────────────────┐
│ [🏷️ Marca: Heart Surgery ×] [📎 Imagem] [___texto___] [▶]│
└─────────────────────────────────────────────────────┘

Quick Actions (acima do input):
📷 Post | 🎠 Carrossel | 📱 Story | 💬 Frase | 🔗 Link | 💼 LinkedIn
```

### Marca como injetor de contexto

```json
{
  "name": "Heart Surgery",
  "context_prompt": "Cores: azul #041956, vermelho #A52639. Estilo médico profissional...",
  "palette": ["#041956", "#A52639", "#FFFFFF"],
  "fonts": { "headings": "Montserrat", "body": "Inter" },
  "do_rules": "Incluir dados estatísticos, tom profissional",
  "dont_rules": "Sem emojis excessivos, sem jargões",
  "reference_images": ["url1", "url2"],
  "personal_photos": ["url3", "url4"]
}
```

---

## Fases de Execução

### Fase 1: Reescrever ai-chat (~1500 linhas)
**Arquivo:** `supabase/functions/ai-chat/index.ts`

**Intents mantidos (simplificados):**
- `GENERATE` — gerar post/story (substitui INICIAR_GERACAO, GERAR_POST, GERAR_CONTEUDO, GERAR_STORY)
- `GENERATE_CAROUSEL` — gerar carrossel (substitui GERAR_CARROSSEL)
- `EDIT_CONTENT` — editar/regenerar conteúdo existente (substitui EDITAR_TEXTO, REGENERAR_IMAGEM)
- `CREATE_BRAND` — criar marca via chat
- `SCHEDULE` — agendar conteúdo
- `CHAT` — conversa livre (minimax)

**Intents removidos:**
- PIPELINE_BACKGROUND (pipeline multi-step eliminado)
- INICIAR_GERACAO (wizard eliminado)
- GERAR_CONTEUDO (merge com GENERATE)
- COMPOR_SLIDES (merge com GENERATE)
- ADAPTAR_PLATAFORMA (pode ser feito via chat)
- CRIAR_SERIE (futuro)
- SUGERIR_CONTEUDO (simplificado)
- CRIAR_MARCA_ANALYZE (merge com CREATE_BRAND)
- EDITAR_VISUAL (merge com EDIT_CONTENT)

**Fluxo GENERATE:**
1. Detectar plataforma (Instagram/LinkedIn) do texto ou default
2. Detectar formato (post/story/carousel) do texto ou default
3. Carregar marca (se selecionada no chat input)
4. Se URL no texto: fetch artigo (com timeout 12s)
5. Montar prompt completo:
   ```
   [Instrução base: dimensões, plataforma]
   [Texto/tema do usuário]
   [Contexto da marca: cores, estilo, regras]
   [Perfil do usuário: nicho, tom, público]
   [Referências visuais da marca: anexadas como imagens]
   ```
6. Chamar Gemini 3.1 Flash Image via generate-slide-images
7. Gerar legenda + hashtags com minimax
8. Salvar em generated_contents
9. Retornar ActionCard

**Fluxo GENERATE_CAROUSEL:**
- Mesmo que GENERATE mas:
  1. Primeiro: minimax gera estrutura textual dos N slides
  2. Depois: para cada slide, chamar Gemini com contexto narrativo
  3. Salvar todos os slides em generated_contents

**Fluxo EDIT_CONTENT:**
1. Carregar conteúdo existente (imagem + texto)
2. Enviar imagem + instrução do usuário ao Gemini
3. Gemini regenera com as modificações pedidas
4. Atualizar generated_contents

### Fase 2: Simplificar frontend
**Arquivos a REMOVER:**
- `src/components/chat/generation/ConfigPhase.tsx` (570 linhas)
- `src/components/chat/generation/BackgroundPhase.tsx` (172 linhas)
- `src/components/chat/generation/TextPhase.tsx` (198 linhas)
- `src/components/chat/generation/CompositionPhase.tsx` (34 linhas)
- `src/components/chat/GenerationFlowStep.tsx` (56 linhas)
- `src/components/chat/GenerationDefaults.tsx` (230 linhas)
- `src/hooks/useGenerationFlow.ts` (150 linhas)
Total removido: ~1410 linhas

**ChatWindow.tsx (simplificar ~400 linhas):**
- Remover: handleConfigSelect, genFlow, wizard rendering
- Manter: mensagens, ActionCard, realtime, chat history
- Adicionar: brand selector no input, quick actions simplificados

**ChatInput.tsx (simplificar):**
- Remover: GenerationDefaults popover
- Adicionar: brand chip selector, quick action pré-preenchimento
- Manter: textarea, send, image upload

**ActionCard.tsx (manter ~95%):**
- Remover: referências a visual modes
- Manter: preview, carousel nav, schedule, approve, regenerate
- Adicionar: botão "Refazer" que abre campo de feedback

### Fase 3: Simplificar marcas
**BrandEdit.tsx:**
- Simplificar aba "Identidade": nome, paleta, fontes, logo
- Simplificar aba "Geração": campo "Contexto para IA" (texto livre), do/don't rules, visual preferences
- Manter aba "Imagens": referências + fotos pessoais
- Remover aba "Estilos": template sets, saved backgrounds (deprecar)

### Fase 4: Simplificar edge functions
**generate-slide-images (simplificar):**
- Remover: buildPrompt complexo, buildBackgroundOnlyPrompt, visual signatures, rules
- Manter: chamada ao inference.sh/Gemini, upload de resultado, fallback chain
- Novo: receber prompt JÁ PRONTO do ai-chat, só executar

**Edge functions a deprecar (não deletar, só parar de chamar):**
- generate-content
- render-slide-image
- build-image-prompts
- create-visual-brief
- generate-template-sets
- generate-style-pack
- analyze-image-layout
- rank-and-select
- generate-image-variations

### Fase 5: Cleanup e polish
- Remover imports mortos
- Verificar que todos os testes passam
- Verificar UX: animações, transições, feedback visual
- Deploy de todas as edge functions
- Testar fluxo completo end-to-end

---

## Database — Sem breaking changes

Não vamos alterar schema existente. Colunas como `template_set_id`, `generation_metadata` etc. ficam nullable e são ignoradas pelo novo código. Isso permite rollback sem migration reversa.

---

## O que NÃO muda

- Landing page e demo scenes
- Help Center com tutoriais
- Calendar e agendamento
- Publish Instagram/LinkedIn
- Admin Analytics
- Auth e Profile
- Contents page
- Studio/ContentPreview (preview de conteúdo)
- Sidebar e layout

---

## Resultado esperado

| Métrica | Antes | Depois |
|---|---|---|
| Linhas ai-chat | ~4155 | ~1500 |
| Linhas frontend removidas | 0 | ~1410 |
| Edge functions ativas | 31 | ~20 |
| Steps para gerar post | 7-10 | 1 (digitar e enviar) |
| Modos visuais | 6 | 1 (Gemini direto) |
| Pontos de falha no pipeline | 4 funções encadeadas | 1 função |
| Tempo de geração | 30-90s | 15-30s |

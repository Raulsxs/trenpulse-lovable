# TrendPulse — Contexto Completo para Desenvolvimento

## O que é TrendPulse

SaaS de geração de conteúdo visual para redes sociais (Instagram + LinkedIn) usando IA. O usuário digita no chat o que quer → a IA gera uma imagem profissional pronta para publicar → o usuário pode agendar e publicar direto pelo app.

**Proposta de valor:** O Gemini gera a imagem. O TrendPulse sabe quem você é (marca, estilo, público) e publica pra você.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase Edge Functions (Deno)
- **DB:** Supabase PostgreSQL
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage (bucket `generated-images`)
- **AI:** inference.sh API (Gemini 3.1 Flash para imagens, minimax para texto)

## Supabase Project

- **Project ID:** `qdmhqxpazffmaxleyzxs`
- **URL:** `https://qdmhqxpazffmaxleyzxs.supabase.co`
- **Region:** South America (São Paulo)

## Arquitetura Simplificada (RECÉM REFATORADA)

### Fluxo de geração (1 step)

```
Usuário digita no chat
  → ai-chat detecta intent
  → Se GENERATE: monta prompt com contexto de marca → chama generate-slide-images → Gemini gera imagem → minimax gera legenda → salva no DB → retorna ActionCard
  → Se GENERATE_CAROUSEL: mesmo, mas N slides sequenciais
  → Se EDIT_CONTENT: carrega conteúdo existente + instrução do usuário → Gemini regenera
  → Se CRIAR_MARCA: wizard de criação de marca
  → Se CHAT: minimax responde (conversa livre)
```

### Intents do ai-chat

| Intent | O que faz |
|---|---|
| `GENERATE` | Gera post/story single com imagem via Gemini |
| `GENERATE_CAROUSEL` | Gera carrossel de N slides |
| `EDIT_CONTENT` | Regenera imagem com feedback do usuário |
| `CRIAR_MARCA` | Wizard de criação de marca (multi-step via chat) |
| `CRIAR_MARCA_ANALYZE` | Análise de referências visuais da marca |
| `ATUALIZAR_PERFIL` | Atualiza nicho/tom/temas do perfil |
| `CHAT` | Conversa livre via minimax |

### Edge Functions Ativas

| Function | Propósito |
|---|---|
| `ai-chat` | Endpoint principal do chat (~1692 linhas) |
| `generate-slide-images` | Geração de imagens via inference.sh/Gemini |
| `publish-instagram` | Publicação direta no Instagram |
| `publish-linkedin` | Publicação direta no LinkedIn |
| `check-usage` | Verifica limites do plano |
| `admin-analytics` | Dashboard admin (restrito ao owner) |
| `scrape-trends` | Scraping de tendências/notícias |
| `analyze-brand-examples` | Análise de referências visuais da marca |
| `render-slide-image` | Composição de texto sobre imagem (Satori) |

### Tabelas Principais

| Tabela | O que armazena |
|---|---|
| `generated_contents` | Conteúdos gerados (título, legenda, slides, imagens, status) |
| `brands` | Marcas do usuário (nome, paleta, fontes, regras, referências) |
| `brand_examples` | Imagens de referência das marcas |
| `chat_messages` | Histórico do chat |
| `ai_user_context` | Contexto do usuário (nicho, tom, temas) |
| `user_subscriptions` | Assinaturas ativas |
| `subscription_plans` | Planos (Free/Pro/Business) |
| `usage_tracking` | Contagem de gerações por mês |
| `content_metrics` | Métricas sociais (likes, comments) |
| `profiles` | Perfil do usuário |

## Frontend — Componentes Principais

### Páginas

| Rota | Componente | Propósito |
|---|---|---|
| `/` | Index.tsx | Landing page com demo animado |
| `/auth` | Auth.tsx | Login/Signup |
| `/chat` | ChatPage.tsx | Chat principal (coração do app) |
| `/contents` | Contents.tsx | Lista de conteúdos gerados |
| `/content/:id` | ContentPreview.tsx | Studio/Editor de conteúdo |
| `/brands` | Brands.tsx | Lista de marcas |
| `/brands/:id/edit` | BrandEdit.tsx | Editor de marca |
| `/calendar` | Calendar.tsx | Calendário editorial |
| `/analytics` | Analytics.tsx | Analytics do usuário |
| `/admin` | AdminAnalytics.tsx | Admin dashboard (owner only) |
| `/profile` | Profile.tsx | Perfil do usuário |
| `/pricing` | Pricing.tsx | Planos e preços |

### Chat Components

- **ChatWindow.tsx** (~1012 linhas) — Container principal do chat
  - Carrega histórico, gerencia mensagens, realtime listeners
  - Quick action buttons que pré-preenchem o chat
  - Brand selector no input
- **ChatInput.tsx** (~308 linhas) — Input bar com brand selector, image upload, URL detection
- **ChatMessage.tsx** — Renderiza mensagens individuais
- **ActionCard.tsx** (~787 linhas) — Card de conteúdo gerado com preview, botões de ação, navegação de slides

### Landing Page Components

- **DemoScenes.tsx** — 4 cenas animadas com Framer Motion
- **ChatMockup.tsx** — Mockup animado do chat
- **ResultGallery.tsx** — Galeria de resultados reais
- **FeatureShowcase.tsx** — Grid de features
- **HowItWorks.tsx** — 3 steps animados
- **PricingSection.tsx** — Planos com preços

### Help Center

- **HelpCenterModal.tsx** — Modal com tabs (Tutoriais + FAQ)
- **HelpTutorials.tsx** — 5 tutoriais animados interativos

## API Gateway (AI)

O arquivo `supabase/functions/_shared/ai-gateway.ts` abstrai múltiplos providers:

1. **inference.sh** (primário) — Gemini 3.1 Flash para imagens, minimax para texto
2. **Google AI** (fallback) — Gemini direto
3. **Lovable Gateway** (fallback) — Gateway de terceiros

### Modelos e custos

| Modelo | Uso | Custo/chamada |
|---|---|---|
| `google/gemini-3-1-flash-image-preview` | Geração de imagem (posts) | $0.076 |
| `google/gemini-2-5-flash-image` | Geração de imagem (carrosséis) | $0.039 |
| `openrouter/minimax-m-25` | Texto (legenda, chat) | $0.001 |
| `google/gemini-2.5-flash-lite` | Extração/classificação | $0.001 |

## Secrets Necessários (Supabase)

- `LOVABLE_API_KEY` — Gateway para AI
- `INFERENCE_SH_API_KEY` — inference.sh
- `GOOGLE_AI_API_KEY` — Google AI Studio
- `META_APP_ID` / `META_APP_SECRET` — Instagram API
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` — LinkedIn API

## Billing

- **Provider:** Asaas (brasileiro, PIX + boleto + cartão)
- **Free:** R$0, 5 gerações/mês, 1 marca
- **Pro:** R$147.90, 100 gerações/mês, 5 marcas
- **Business:** R$297.00, unlimited, 10 marcas

## Problemas Conhecidos e Recentes

### Bugs que foram corrigidos nesta sessão:
1. JWT expirado em chamadas internas (corrigido: usa service_role)
2. Pipeline multi-step falhava silenciosamente (corrigido: pipeline eliminado)
3. Tema do usuário ignorado na geração (corrigido: incluído no briefing)
4. PIPELINE_DONE falso positivo (corrigido: verifica image_urls)
5. Modelo inexistente na conversa livre (corrigido: trocou para minimax)

### Status atual (pós-refatoração):
- ai-chat reescrito de 4155 para 1692 linhas
- ChatWindow simplificado de 1858 para 1012 linhas
- Wizard eliminado — fluxo direto via chat
- 6 modos visuais eliminados — Gemini gera tudo diretamente
- Pipeline de 4 funções encadeadas → 1 chamada direta

### O que precisa funcionar:
1. **Geração de post** — Usuário digita tema → imagem gerada pelo Gemini → ActionCard aparece
2. **Geração de carrossel** — Mesmo, mas múltiplos slides
3. **Frase com foto** — Usuário digita frase → imagem elegante com aspas
4. **Post de link** — Cola URL → extrai conteúdo → gera post
5. **Marca como contexto** — Brand selector no input → contexto injetado no prompt
6. **Publicação** — Aprovar → Publicar no Instagram/LinkedIn
7. **Agendamento** — Aprovar → Agendar data/hora → publicação automática

## Como gerar conteúdo (fluxo atual)

1. Usuário seleciona marca no chip do input (opcional)
2. Digita ou clica num quick action (📷 Post, 🎠 Carrossel, etc.)
3. Frontend envia `{ message, brandId, history }` para ai-chat
4. ai-chat:
   - Classifica intent (GENERATE, GENERATE_CAROUSEL, etc.)
   - Carrega marca se brandId fornecido
   - Monta prompt com contexto (marca + perfil + tema)
   - Chama generate-slide-images (que chama Gemini)
   - Gera legenda com minimax
   - Salva em generated_contents
   - Retorna ActionCard com preview
5. ActionCard mostra imagem com botões (Aprovar, Agendar, Studio, Nova imagem, etc.)

## Design System

- **Direction:** Warmth & Approachability
- **Spacing:** base 4px, scale 4/8/12/16/24/32
- **Radius:** rounded-md default, rounded-lg cards, rounded-xl features
- **Depth:** borders-first (3.3:1 ratio over shadows)
- **Colors:** Usar variáveis CSS do Tailwind (primary, muted, etc.)
- **Icons:** lucide-react, w-4 h-4 default
- **Animations:** framer-motion para scroll/transitions

## Owner

- **Raul Silva** (raul@trendpulse.app)
- **Cliente principal:** Dr. Maikon Madeira (coach/médico)
- **GitHub:** Raulsxs/trenpulse-lovable (backup: Raulsxs/blank-canvas)

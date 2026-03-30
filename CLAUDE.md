# TrendPulse — Context Document for Claude Sessions

## What is TrendPulse

TrendPulse is a SaaS for social media content generation. Users paste a link or type a topic in a chat interface, and the platform generates branded visual content (posts, carousels, stories, documents) for Instagram and LinkedIn — ready to publish.

**Owner:** Raul Silva (raul@trendpulse.app)
**Stack:** React + Vite + TypeScript (frontend), Supabase Edge Functions in Deno (backend)
**Status:** Pre-launch MVP. Infrastructure migrated on 2026-03-30.

## Infrastructure

- **Supabase project:** `qdmhqxpazffmaxleyzxs` (South America region)
- **GitHub repo:** https://github.com/Raulsxs/blank-canvas
- **Lovable:** blank-canvas project (used for frontend editing only)
- **Edge functions:** 31 functions, deployed via Lovable
- **Frontend:** Auto-deploys on git push via Lovable
- **Edge function deploy:** Ask Lovable to redeploy, OR use Supabase CLI
- **Supabase Dashboard:** Full access for SQL, logs, secrets, auth

### Secrets configured in Supabase:
- `LOVABLE_API_KEY` — AI Gateway for Gemini (text + image generation)
- `INFERENCE_SH_API_KEY` — inference.sh for premium image generation
- `FIRECRAWL_API_KEY` — Firecrawl for trend scraping
- `GOOGLE_AI_API_KEY` — Google AI Studio (future replacement for Lovable Gateway)
- `ASAAS_API_KEY` — Payment provider (Asaas, NOT Stripe)
- `META_APP_ID`, `META_APP_SECRET` — Instagram API
- `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` — LinkedIn API

### AI Gateway
Currently uses `LOVABLE_API_KEY` → `ai.gateway.lovable.dev`. Helper at `supabase/functions/_shared/ai-gateway.ts` auto-detects provider. When `GOOGLE_AI_API_KEY` billing is activated, set the key in Supabase secrets and the system switches automatically.

## Architecture Overview

### Frontend (React/Vite)
- **Chat** (`src/components/chat/ChatWindow.tsx` ~1600 lines): Main interface with generation wizard
- **ActionCard** (`src/components/chat/ActionCard.tsx`): Content previews inline in chat, polls for image updates
- **Studio** (`src/pages/ContentPreview.tsx`): Content viewer with social media mockup preview (LinkedIn/Instagram)
- **Brands** (`src/pages/Brands.tsx`, `src/pages/BrandEdit.tsx`): Brand management
- **Profile** (`src/pages/Profile.tsx`): User settings — niche, tone, audience, content sources

### Backend (31 Supabase Edge Functions)

```
User input (chat)
  ↓
ai-chat (INICIAR_GERACAO) — orchestrator, ~3800 lines
  ↓
generate-content — text generation via Gemini 2.5 Flash
  ↓
PIPELINE_BACKGROUND (1 call per slide, from frontend)
  ↓
generate-slide-images — inference.sh (Gemini 3.1 Flash) → Lovable Gateway fallback
  ↓
render-slide-image — compose text overlay (for ai_background/ai_illustration_titled modes)
  ↓
Updates generated_contents.image_urls (incrementally merged)
```

### Visual Modes

| Mode | How it works |
|------|-------------|
| `ai_full_design` | AI generates complete image WITH text baked in |
| `ai_illustration` | AI generates photorealistic illustration, optional subtle text |
| `ai_illustration_titled` | AI generates illustration (no text) → render-slide-image adds headline overlay |
| `ai_background` | AI generates background → render-slide-image composites text on top |
| `template_clean` | Brand colors as gradient background with HTML text overlay |
| `photo_overlay` | User's photos as background + text overlay |

### Content Source Flow (wizard)

When user clicks "Criar conteúdo":
```
Platform → Format → Brand (or "Sem marca") → "De onde vem o conteúdo?"
  → 🔗 Colar um link (sourceUrl → article fetch)
  → 💡 Sugestões de conteúdo (SUGERIR_CONTEUDO → trends/Firecrawl)
  → ✏️ Escrever do zero (sourceText)
→ Visual style → Slide count (if multi-slide) → Generate
```

**Direct generation (MODE 0):** When GenerationDefaults (⚙️) has platform + brand configured, typing in chat generates directly without wizard.

**"Sem marca":** Sets brandId="none", backend skips brand resolution, defaults to ai_illustration mode.

### Multi-Slide Pipeline

Frontend fires PIPELINE_BACKGROUND one slide at a time:
```
For each slide sequentially:
  → ai-chat PIPELINE_BACKGROUND (1 slide, 90s timeout)
    → generate-slide-images (inference.sh → Gateway fallback)
    → Phase 3: update slides + merge image_urls
```
- Toast shows progress: "Gerando imagens: slide 2 de 5..."
- Real slide_index from DB used (not array position)
- inference.sh: skip retry on 500, retry without refs on first 500

### Content Dimensions

| Platform | Format | Dimensions | Aspect Ratio |
|----------|--------|-----------|-------------|
| Instagram | Post/Carousel | 1080x1080 | 1:1 |
| Instagram | Story | 1080x1920 | 9:16 |
| LinkedIn | Post | 1200x627 | 1.91:1 |
| LinkedIn | Document | 1080x1350 | 4:5 |

Defined in 3 places (must stay in sync):
1. `src/lib/contentDimensions.ts`
2. `supabase/functions/ai-chat/index.ts` → `resolveContentDimensions()`
3. `supabase/functions/generate-slide-images/index.ts`

### Studio Preview (ContentPreview.tsx)

Shows content as social media mockup:
- **LinkedIn:** Post card with profile, caption above image, engagement bar
- **Instagram feed:** Post with avatar, action buttons, caption below
- **Instagram story:** Fullscreen with progress bar, no caption
- For `ai_full_design`/`ai_illustration`: shows actual image (not re-rendered)
- LinkedInDocumentRenderer only used as fallback when no AI image exists

## Bugs Fixed (sessions 2026-03-24 to 2026-03-30)

### Critical fixes:
1. **Content contamination** — sourceUrl not set in sourceInput, theme=niche instead of topic
2. **ActionCard disappearing** — intent filter hid messages with content_id
3. **Duplicate ActionCards** — PIPELINE_BACKGROUND saved chat message with content_id
4. **Delete cascade** — handleReject now checks errors, correct FK order
5. **Chat session persistence** — localStorage tp_conversation_since
6. **Two images in chat** — polling stops on composite, not raw background
7. **Brand overriding topic** — explicit rule in system prompt: brand = visual only
8. **Multi-slide timeout** — 1 slide per PIPELINE_BACKGROUND call, 90s timeout
9. **JSON parse retry** — malformed JSON triggers retry (3 attempts for documents)
10. **Quote false positive** — removed generic regex that matched action verbs as quotes

### UX improvements:
- Persistent toast for multi-slide generation progress
- Cancel button during loading state
- Source input split into 3 clear options (link/suggestions/write)
- Content suggestions via SUGERIR_CONTEUDO + Firecrawl trends
- Social media mockup preview in Studio (LinkedIn + Instagram)
- "Sem marca" option in brand selection
- "Imagem ilustrativa" visual mode (with/without title choice)
- Simplified Profile page (removed duplicates, generic audience options)

### Known remaining issues:
- **inference.sh rate limiting** — fails on rapid sequential calls (carousels), works for single images
- **AI visual inconsistency** — each carousel slide generated independently
- **Mobile responsiveness** — layout not optimized for small screens
- **generated_contents + chat_messages** — not migrated from old project (large tables)

## Testing

Smoke tests: `npm test` (27 tests, ~2s)
Located at: `src/test/smoke-chat-logic.test.ts`

Covers: chat filter, ActionCard dedup, URL detection, hasSource, hasRenderableImage, theme priority, carousel render_mode.

**Always run `npm test` before pushing changes to ai-chat or ChatWindow.**

## Key Patterns

### When editing ai-chat/index.ts (~3800 lines)
- Every change risks regressions. Run tests first.
- Handles: INICIAR_GERACAO, PIPELINE_BACKGROUND, GERAR_POST, CRIAR_MARCA, SUGERIR_CONTEUDO, REGENERAR_IMAGEM, CONVERSA_LIVRE, etc.
- AI extraction: skip for short topics (<100 chars), only for articles with fullContent
- Brand resolution: "none" = no brand, null = auto-resolve

### When editing ChatWindow.tsx (~1600 lines)
- Wizard steps: platform → content_type → brand → source_input/source_link/source_write/suggestions_pending/illustration_title → visual_style → slide_count
- handleQuickReply uses `genFlow.flow.configStep` (not genFlow.configStep)
- MODE 0: if defaults have platform + brand, generates directly from chat text

### Chat message filtering
- Filter by both `content` AND `intent`
- Messages with intent=INICIAR_GERACAO + action_result.content_id are PRESERVED (ActionCards)
- INTERNAL_INTENTS: PIPELINE_BACKGROUND, INICIAR_GERACAO, GERAR_CONTEUDO, CRIAR_MARCA_ANALYZE, PIPELINE_DONE, SUGERIR_CONTEUDO, CRIAR_SERIE, GERAR_POST, GERAR_CARROSSEL, GERAR_STORY

### image_urls updates
- Always MERGE (append, not overwrite)
- Each PIPELINE_BACKGROUND call handles 1 slide and appends its image

### render-slide-image
- LinkedIn documents: light style (white overlay, dark text, light bg)
- All others: dark scrim, white text
- Receives `platform` and `content_type` from ai-chat

### generate-slide-images
- inference.sh app: `google/gemini-3-1-flash-image-preview` (NOT nano-banana-2)
- On 500 with refs: retry without reference images first
- On repeated 500: skip to Lovable Gateway fallback
- illustrationMode: generates photorealistic scene, not text-heavy design

## Design System

File: `.interface-design/system.md`
Direction: Warmth & Approachability
- Spacing: base 4px, scale 4/8/12/16/24/32
- Radius: rounded-md (default), rounded-lg (cards), rounded-xl (feature)
- Depth: borders-first (3.3:1 ratio over shadows)
- Typography: text-xs (labels), text-sm (body), text-lg (headings)
- Icons: lucide-react, w-4 h-4 (default)

## Billing

Provider: **Asaas** (NOT Stripe) — lowest fees in Brazil. PIX, boleto, credit card.

## Roadmap (post-launch)

1. **Billing** via Asaas — 3 tiers: Free/Pro/Business
2. **Unify render engine** — eliminate Satori for composites, use html-to-image
3. **Magic onboarding** — Instagram @ → auto brand → first content in 30s
4. **PWA + mobile** — chat-first mobile experience
5. **Analytics** — Instagram/LinkedIn metrics integration
6. **Content intelligence** — proactive trends, series, best time to post
7. **Team/collaboration** for agencies

## Pending Tasks

- [ ] Import generated_contents and chat_messages from old project (large tables)
- [ ] Activate Google AI billing and switch from Lovable Gateway
- [ ] Configure custom domain
- [ ] Set up GitHub Actions for edge function auto-deploy
- [ ] Refactor ai-chat/index.ts into separate handler modules
- [ ] Refactor ChatWindow.tsx — extract hooks (useGenerationWizard, useChatHistory)
- [ ] Mobile responsiveness
- [ ] Trends scheduler cron job configuration

# TrendPulse — Context Document for Claude Sessions

## What is TrendPulse

TrendPulse is a SaaS for social media content generation. Users paste a link or type a topic in a chat interface, and the platform generates branded visual content (posts, carousels, stories, documents) for Instagram and LinkedIn — ready to publish.

**Owner:** Raul Silva (raul@trendpulse.app)
**Stack:** React + Vite + TypeScript (frontend), Supabase Edge Functions in Deno (backend), Lovable Cloud (hosting + managed Supabase)
**Status:** Pre-launch MVP, targeting launch week of 2026-03-25

## Architecture Overview

### Frontend (React/Vite)
- **Chat** (`src/components/chat/ChatWindow.tsx` ~1600 lines): Main interface. Users interact via chat to generate content. Contains the generation wizard flow (platform → format → brand → source → visual style).
- **ActionCard** (`src/components/chat/ActionCard.tsx`): Renders content previews inline in chat. Polls `generated_contents` for image updates.
- **Studio** (`src/pages/ContentPreview.tsx`, `src/pages/Studio.tsx`): Full editor for generated content. Shows all slides with editing capabilities.
- **Brands** (`src/pages/Brands.tsx`, `src/pages/BrandEdit.tsx`): Brand management — colors, fonts, templates, visual style.

### Backend (30 Supabase Edge Functions)
The content generation pipeline flows through these key functions:

```
User input (chat)
  ↓
ai-chat (INICIAR_GERACAO intent) — orchestrator, ~3800 lines
  ↓
generate-content — text generation via Gemini 2.5 Flash
  ↓ returns slides JSON (headline, body, bullets, caption)
ai-chat saves to generated_contents + slides tables
  ↓
PIPELINE_BACKGROUND (fire-and-forget from frontend, 1 call per slide)
  ↓
generate-slide-images — image generation via inference.sh → Lovable Gateway fallback
  ↓
render-slide-image — compose text overlay on background (for ai_background mode)
  ↓
Updates generated_contents.image_urls (incrementally merged)
```

### Key Edge Functions

| Function | Purpose |
|----------|---------|
| `ai-chat` | Main orchestrator. Handles all chat intents (INICIAR_GERACAO, PIPELINE_BACKGROUND, GERAR_POST, CRIAR_MARCA, etc.) |
| `generate-content` | Generates slide text content via Gemini 2.5 Flash. Returns JSON with slides, caption, hashtags |
| `generate-slide-images` | Generates images per slide. Uses inference.sh (Gemini 3.1 Flash) → falls back to Lovable Gateway |
| `render-slide-image` | Composes text overlay on background image (for ai_background mode, not ai_full_design) |
| `analyze-brand-examples` | Multimodal analysis of brand reference images to extract style |
| `generate-template-sets` | Creates visual templates from brand examples |
| `analyze-image-layout` | Vision AI analysis of generated images for text positioning |
| `publish-instagram` / `publish-linkedin` | Publishes content to social media APIs |
| `instagram-scheduler` | Cron-triggered scheduler for scheduled posts |

### Database (Supabase/Postgres)

Key tables:
- `generated_contents` — main content table (slides JSON, image_urls, caption, status, brand_snapshot)
- `slides` — individual slide records linked to posts
- `posts` → `projects` → `brands` — content hierarchy
- `chat_messages` — persisted chat history
- `ai_user_context` — user profile (business_niche, brand_voice, content_topics)
- `brand_template_sets` — visual templates per brand
- `brand_examples` — uploaded brand reference images
- `image_generations` — generated images per slide (with is_selected flag)
- `visual_briefs`, `image_prompts` — intermediate pipeline data

FK cascade chain: `projects → posts → slides → visual_briefs/image_prompts/image_generations/slide_versions/quality_metrics` (all CASCADE)

### Visual Modes

| Mode | How it works |
|------|-------------|
| `ai_full_design` | AI generates complete image WITH text baked in. No HTML overlay needed. |
| `ai_background` | AI generates background only → `render-slide-image` composites text on top |
| `template_clean` | No AI image. Uses brand colors as gradient background with HTML text overlay |
| `photo_overlay` | User's photos as background + text overlay |

## Deploy Flow

- **Frontend**: Auto-deploys on `git push` via Lovable
- **Edge Functions**: Must be manually redeployed by asking Lovable ("redeploy ai-chat")
- **SQL Migrations**: Run via Lovable SQL editor (not Supabase Dashboard)
- **Never** reference Supabase CLI, Supabase Dashboard, or Supabase plans — TrendPulse runs on Lovable's managed Supabase

## Content Generation Flow (Detailed)

### Flow A: User pastes link in chat
1. `handleSend` detects URL → extracts sourceUrl + detects platform/format from text
2. Wizard asks for missing info (brand, format if not detected)
3. `startGeneration` calls `INICIAR_GERACAO` with sourceUrl
4. `INICIAR_GERACAO` fetches article HTML → strips tags → extracts up to 4000 chars
5. AI extraction generates title/insights from article
6. `generate-content` receives full article as `trend.fullContent`
7. Returns slides JSON → saved to DB
8. Frontend fires `PIPELINE_BACKGROUND` sequentially, ONE slide per call
9. Each call generates image via `generate-slide-images` and updates `image_urls`

### Flow B: User clicks "Criar conteúdo" button
1. Wizard asks: platform → format → brand → topic/link (sourceInput step)
2. If user pastes URL in sourceInput → detected and set as sourceUrl
3. If user types text → set as sourceText (topic)
4. Same from step 3 onwards as Flow A

### Key Rules
- `sourceUrl` (link) skips the sourceInput step — the URL IS the source
- `trend.theme` receives the user's `business_niche`, NOT the topic. Topic goes in `trend.title`
- The sourceBlock in generate-content marks user topic as "PRIORIDADE MÁXIMA" over niche
- Chat history URLs are NOT extracted for generation (prevents topic contamination)

## Multi-Slide Pipeline

For carousels (5 slides) and documents, the frontend fires PIPELINE_BACKGROUND **one slide at a time**:

```
Frontend: for each slide sequentially
  → ai-chat PIPELINE_BACKGROUND (1 slide, ~40-50s)
    → generate-slide-images (~30-45s)
    → Phase 3: update generated_contents.slides + merge image_urls
```

- Each edge function call handles 1 slide → fits in 60s wall time
- `image_urls` are merged incrementally (append, not overwrite)
- Frontend shows persistent toast: "Gerando imagens: slide 2 de 5..."
- Phase 1 (text gen) is skipped if slide already has text from generate-content

## Content Dimensions

| Platform | Format | Dimensions | Aspect Ratio |
|----------|--------|-----------|-------------|
| Instagram | Post | 1080x1080 | 1:1 |
| Instagram | Carousel | 1080x1080 | 1:1 |
| Instagram | Story | 1080x1920 | 9:16 |
| LinkedIn | Post | 1200x627 | 1.91:1 |
| LinkedIn | Document | 1080x1350 | 4:5 |
| LinkedIn | Story | 1080x1920 | 9:16 |

Defined in 3 places (must stay in sync):
1. `src/lib/contentDimensions.ts` (frontend rendering)
2. `supabase/functions/ai-chat/index.ts` → `resolveContentDimensions()`
3. `supabase/functions/generate-slide-images/index.ts` (image generation prompts)

## Known Limitations

1. **inference.sh frequently fails** → falls back to Lovable Gateway which has no dimension control (relies on prompt text)
2. **Lovable edge functions: 60s wall / 50s CPU** — multi-slide content must be processed one slide at a time
3. **AI visual consistency** — each slide is generated independently, so visual style may vary between slides of the same carousel
4. **JSON truncation** — Gemini sometimes returns truncated JSON for documents/carousels (5+ slides). generate-content retries up to 3 times with repair logic
5. **instagram-scheduler** runs every ~60s via external trigger, even when there's nothing to publish

## Testing

Smoke tests: `npm test` (27 tests, ~2s)
Located at: `src/test/smoke-chat-logic.test.ts`

Tests cover:
- Chat history filter (preserves ActionCards, filters internal intents)
- ActionCard deduplication by content_id
- sourceInput URL detection
- hasSource check (sourceUrl skips sourceInput)
- hasRenderableImage polling logic
- Theme vs niche priority
- Carousel consistent render_mode

## Design System

File: `.interface-design/system.md`
Direction: Warmth & Approachability
- Spacing: base 4px, scale 4/8/12/16/24/32
- Radius: rounded-md (default), rounded-lg (cards), rounded-xl (feature), rounded-full (avatars)
- Depth: borders-first (3.3:1 ratio over shadows)
- Typography: text-xs (labels), text-sm (body), text-lg (headings)
- Icons: lucide-react, w-4 h-4 (default)

## Billing

Provider: **Asaas** (NOT Stripe) — lowest fees in Brazil. Supports PIX, boleto, credit card.
API docs: https://docs.asaas.com/

## Important Patterns

### When editing ai-chat/index.ts
- It's ~3800 lines with dozens of intents. Every change risks regressions.
- Always run `npm test` before pushing.
- The file handles: INICIAR_GERACAO, PIPELINE_BACKGROUND, GERAR_POST, GERAR_CARROSSEL, GERAR_STORY, CRIAR_MARCA, SUGERIR_CONTEUDO, CRIAR_SERIE, REGENERAR_IMAGEM, REGENERAR_TEXTO, CONVERSA_LIVRE, and more.

### When editing ChatWindow.tsx
- ~1600 lines handling chat, generation wizard, message rendering.
- The generation wizard has steps: platform → content_type → brand → sourceInput → visual_style → slide_count → background_mode
- Steps are skipped dynamically based on what's already known (e.g., sourceUrl skips sourceInput)

### Chat message filtering
Messages from DB are filtered by both `content` AND `intent`. Messages with intent=INICIAR_GERACAO that carry `action_result.content_id` are PRESERVED (they render ActionCards). All other internal intents are filtered out.

### image_urls updates
Always MERGE with existing (append new, don't overwrite). Each PIPELINE_BACKGROUND call handles 1 slide and appends its image to the array.

## Migration: Lovable Cloud → Supabase Own

See `MIGRATION.md` for the full migration plan. Key points:
- Keeping Lovable for frontend editing
- Moving to self-managed Supabase for backend control
- Replacing `LOVABLE_API_KEY` (Lovable Gateway) with `GOOGLE_AI_API_KEY` (Google AI Studio)
- Helper: `supabase/functions/_shared/ai-gateway.ts` — auto-detects provider
- 15 edge functions need to be updated to use the helper
- Status: Phase 0 in progress

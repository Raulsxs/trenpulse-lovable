# TrendPulse — Context Document for Claude Sessions

## What is TrendPulse

TrendPulse is a SaaS for social media content generation. Users type in a chat interface what they want → AI generates professional visual content (posts, carousels, stories) → ready to publish on Instagram, LinkedIn, TikTok, X, Facebook, Pinterest, Bluesky, Threads, and YouTube.

**Owner:** Raul Silva (raul@trendpulse.app)
**Stack:** React + Vite + TypeScript (frontend), Supabase Edge Functions in Deno (backend)
**Status:** Post-refactor. Major simplification completed April 2026.

## Infrastructure

- **Supabase project:** `qdmhqxpazffmaxleyzxs` (South America region)
- **GitHub repo:** https://github.com/Raulsxs/trenpulse-lovable
- **Backup branch:** `backup/pre-simplification` (full code before April 2026 refactor)
- **Frontend:** Lovable (auto-deploys on git push)
- **Edge function deploy:** Via Supabase CLI (`npx supabase functions deploy <name> --project-ref qdmhqxpazffmaxleyzxs`)
- **Domain:** trendpulse.com.br

### Secrets configured in Supabase:
- `INFERENCE_SH_API_KEY` — inference.sh for AI image/text generation
- `LOVABLE_API_KEY` — AI Gateway for Gemini (fallback)
- `GOOGLE_AI_API_KEY` — Google AI Studio (fallback)
- `POSTFORME_API_KEY` — Post for Me API for multi-platform publishing
- `BLOTATO_API_KEY` — Blotato visual templates API ($29/mês, 1750 credits)
- `APP_URL` — https://trendpulse.com.br
- `FIRECRAWL_API_KEY` — Firecrawl for trend scraping
- `ASAAS_API_KEY` — Payment provider

### AI Models & Costs (inference.sh)
| Model | Use | Cost/call |
|---|---|---|
| `google/gemini-3-1-flash-image-preview` | Image generation (posts) | $0.076 |
| `google/gemini-2-5-flash-image` | Image generation (carousels) | $0.039 |
| `openrouter/minimax-m-25` | Text (captions, chat, variants) | $0.001 |
| `google/gemini-2.5-flash-lite` | Classification, extraction | $0.001 |

## Architecture (Post-Refactor)

### Content Generation Flow (1 step)
```
User types in chat → ai-chat detects intent
  ├─ GENERATE: builds prompt + brand context → calls generate-slide-images → Gemini generates → minimax generates caption → saves → returns ActionCard
  ├─ GENERATE_CAROUSEL: same but N slides
  ├─ EDIT_CONTENT: loads existing + user instruction → Gemini regenerates
  ├─ CRIAR_MARCA: brand creation wizard (multi-step chat)
  └─ CHAT: minimax responds (free conversation)
```

### Brand Modes
- **`creation_mode: "photo_backgrounds"`** — User's personal photos used as literal background. Gemini gets the photo as reference with instruction to preserve it and overlay text.
- **`creation_mode: "style_copy"` / `"inspired"`** — Reference images used for style replication. Gemini copies the visual style.
- **`creation_mode: "from_scratch"`** — No references. Gemini creates freely.

### Multi-Platform Publishing (Post for Me)
- **Single API key** for all users
- `connect-social` queries PFM API directly (`GET /social-accounts`) — NOT our DB
- `publish-postforme` payload: `{ caption, social_accounts: ["spc_xxx"], media: [{ url }] }`
- Platform-specific caption variants auto-generated (Instagram, LinkedIn, X, TikTok, Facebook)
- Bilingual captions: user selects language + platforms in Profile (stored in `extra_context.bilingual_platforms`)
- **IMPORTANT**: Use `getUser()` for auth in all edge functions — NEVER `getClaims()` (returns wrong user.id)

### Blotato Visual Templates
- **API**: `backend.blotato.com/v2`, key as `BLOTATO_API_KEY`
- **0-credit templates** (unlimited): tweet-card, tutorial-carousel, quote-card
- **Credit-based**: infographics (1-50), video (50-1250), product placement (1-50)
- `blotato-proxy` edge function: proxy with server-side polling (45s/90s/120s timeouts)
- Intent `GENERATE_TEMPLATE` in ai-chat: detects template keywords, uses minimax to structure inputs, calls blotato-proxy
- Template detection runs AFTER all intent conversions (LINK_PARA_POST → GENERATE) so templates take priority

### Edge Functions (Active)

| Function | Purpose |
|---|---|
| `ai-chat` | Main chat endpoint (~2000 lines). Handles GENERATE_TEMPLATE, GENERATE, CAROUSEL, EDIT, BRAND, CHAT |
| `generate-slide-images` | Image generation via inference.sh/Gemini. Accepts `customPrompt` |
| `blotato-proxy` | Blotato visual template API proxy with server-side polling |
| `connect-social` | Social account management — queries PFM API directly for connected accounts |
| `publish-postforme` | Multi-platform publishing via PFM (correct payload format) |
| `postforme-callback` | OAuth callback handler (legacy — PFM redirect goes to app URL now) |
| `check-usage` | Subscription usage validation |
| `admin-analytics` | Admin dashboard (restricted to owner) |
| `scrape-trends` | Trend scraping |
| `analyze-brand-examples` | Brand visual analysis |
| `render-slide-image` | Satori text-over-image composition |

### Key Frontend Components

| Component | Purpose |
|---|---|
| `ChatWindow.tsx` | Main chat with 5 quick actions + Templates dropdown + brand selector |
| `ChatInput.tsx` | Input with Templates button, brand selector, image upload |
| `ActionCard.tsx` | Content preview with visible caption/hashtags, carousel nav, publish, Animar button |
| `SocialConnections.tsx` | 9 platform cards with SVG icons, connect/disconnect |
| `BrandEdit.tsx` | Brand editor with do/don't rules, visual preferences |
| `DemoScenes.tsx` | 4 animated demo scenes for landing page |
| `HelpTutorials.tsx` | 5 interactive tutorials in Help Center |
| `AdminAnalytics.tsx` | Admin dashboard with KPIs, costs, users |

### Database Tables (Key)

| Table | Purpose |
|---|---|
| `generated_contents` | Generated content (title, caption, slides, images, platform_captions) |
| `brands` | User brands (palette, fonts, rules, creation_mode, visual_preferences) |
| `brand_examples` | Brand reference images (purpose: "reference" or "background") |
| `social_connections` | Connected social accounts via Post for Me |
| `chat_messages` | Chat history |
| `ai_user_context` | User context (niche, tone, topics) |
| `user_subscriptions` | Active subscriptions |
| `subscription_plans` | Plans (Free/Pro/Business) |
| `usage_tracking` | Monthly generation counts |

## Recent Changes (April 2026)

### Major Refactor
- ai-chat rewritten from 4155 to ~1700 lines (59% reduction)
- ChatWindow simplified from 1858 to 1012 lines (46% reduction)
- Wizard eliminated — direct chat generation
- 6 visual modes → 1 (Gemini generates everything)
- Pipeline of 4 chained functions → 1 direct call
- 15+ intents → 7 clean intents

### Post for Me Integration
- 9 platforms via single API
- OAuth flow with callback
- Multi-platform publish with platform-specific captions
- Replaces direct Meta/LinkedIn API integrations

### Photo Background Mode
- Brands with creation_mode="photo_backgrounds" use personal photos as literal background
- Photos loaded from brand_examples with purpose="background"
- Special prompt instructs Gemini to preserve photo and overlay text

### Regeneration UX
- "Ajustar" button opens dialog with quick suggestion pills
- "Refazer" uses EDIT_CONTENT to regenerate with new visual
- 7 quick suggestions: texto menor, fonte diferente, cores vibrantes, etc.

### Multi-Platform Caption Variants
- Auto-generated on content creation via minimax
- Instagram, LinkedIn, X, TikTok, Facebook optimized versions
- Stored in `platform_captions` JSONB column

## Integration Roadmap

### Completed
- [x] Post for Me — multi-platform publishing (9 platforms)
- [x] Multi-platform caption variants
- [x] Photo background mode for personal brands

### Planned
- [ ] Apify Analytics — real Instagram/LinkedIn metrics (Raul has account)
- [ ] Gamification — Social Score (0-100) + achievement badges
- [ ] Higgsfield Video — AI video for Reels/Stories (Business plan feature)
- [ ] Pricing redesign — credit-based model instead of fixed generations

## Billing
- **Provider:** Asaas (considering Stripe migration)
- **Free:** R$0, 5 gens/month, 1 brand
- **Pro:** R$147.90, 100 gens/month, 5 brands
- **Business:** R$297.00, unlimited, 10 brands
- **Pricing redesign needed** — credit packs, per-use, multi-feature costs

## Key Client
- **Dr. Maikon Madeira** — coach/health professional
- Use cases: personal photo + motivational phrase, educational carousels, LinkedIn posts
- Brand "Fotos pessoais" with creation_mode="photo_backgrounds"

## Testing
- Smoke tests: `npm test` (28 tests, ~2s)
- Located at: `src/test/smoke-chat-logic.test.ts`
- **Always run `npm test` before pushing changes**

## Edge Function Deployment
```bash
npx supabase functions deploy <function-name> --project-ref qdmhqxpazffmaxleyzxs
```
Deploy ALL key functions:
```bash
npx supabase functions deploy ai-chat --project-ref qdmhqxpazffmaxleyzxs
npx supabase functions deploy generate-slide-images --project-ref qdmhqxpazffmaxleyzxs
npx supabase functions deploy connect-social --project-ref qdmhqxpazffmaxleyzxs
npx supabase functions deploy publish-postforme --project-ref qdmhqxpazffmaxleyzxs
```

## Key Patterns

### Internal Edge Function Calls
All internal calls between edge functions use `SUPABASE_SERVICE_ROLE_KEY` (not user JWT) to prevent token expiry during long operations:
```typescript
const internalHeaders = {
  Authorization: `Bearer ${internalServiceKey}`,
  "Content-Type": "application/json",
  apikey: supabaseAnonKey,
};
```

### generate-slide-images accepts `customPrompt`
When `customPrompt` is provided, it bypasses the internal prompt builder and sends the prompt directly to Gemini. This is the standard flow from the refactored ai-chat.

### Brand as Context Injector
Brands are not visual mode controllers anymore — they inject context into the AI prompt:
- Name, palette, fonts, tone, do/don't rules
- Reference images (for style) or background photos (for literal use)
- Visual preferences (custom_notes, phone_mockup, etc.)

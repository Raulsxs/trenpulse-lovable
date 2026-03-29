# TrendPulse — Migration Plan: Lovable Cloud → Supabase Own

## Overview

Migrating TrendPulse from Lovable Cloud (managed Supabase) to a self-managed Supabase project. The Lovable editor is kept for frontend development — only the database/backend moves.

**Why migrate:**
- Full control over edge functions (deploy, logs, timeouts)
- Direct Supabase Dashboard access (SQL editor, logs, metrics)
- No dependency on Lovable for backend operations
- Better debugging (Lovable Cloud rotates logs quickly)
- Configurable limits (workers, timeouts)

**Approach:** Video 2 method — create blank Lovable project, copy code, connect own Supabase. Keeps Lovable for frontend editing.

---

## Phase 0 — AI Gateway Preparation (OPTIONAL — can do after migration)

### Status: HELPER CREATED, SUBSTITUTION DEFERRED

> A migração pode ser feita SEM trocar o Gateway. O `LOVABLE_API_KEY` será
> copiado para o Supabase novo como secret. O Gateway continua funcionando.
> A troca para Google AI Studio será feita depois, quando o billing for ativado.

The Lovable Gateway (`ai.gateway.lovable.dev`) is used in **15 edge functions** for AI calls (text generation, image generation, vision analysis). This gateway likely won't work outside Lovable Cloud.

### Replacement: Google AI Studio

**Google AI Studio** provides an OpenAI-compatible endpoint:
```
https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
```

**API Key:** Set as `GOOGLE_AI_API_KEY` env var in Supabase secrets.
Get key from: https://aistudio.google.com/apikey

> **NOTA IMPORTANTE:** O billing do Google Cloud NÃO precisa estar ativo para a migração.
> A migração será feita mantendo o `LOVABLE_API_KEY` como provider ativo.
> O código suporta ambos (via helper `_shared/ai-gateway.ts`).
> Após a migração, quando o billing for ativado, basta configurar
> `GOOGLE_AI_API_KEY` no Supabase Secrets e o sistema troca automaticamente.
> Enquanto isso, o Lovable Gateway continua funcionando normalmente.

### Helper Created

File: `supabase/functions/_shared/ai-gateway.ts`

```typescript
import { getAIConfig, resolveModel } from "../_shared/ai-gateway.ts";

const ai = getAIConfig();
const resp = await fetch(ai.url, {
  headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: resolveModel("google/gemini-2.5-flash"), messages: [...] }),
});
```

Auto-detects provider:
- `GOOGLE_AI_API_KEY` set → uses Google AI Studio
- `LOVABLE_API_KEY` set → uses Lovable Gateway (fallback)

### Model Name Mapping

| Lovable Gateway | Google AI Studio |
|----------------|-----------------|
| `google/gemini-2.5-flash` | `gemini-2.5-flash` |
| `google/gemini-2.5-flash-lite` | `gemini-2.5-flash` |
| `google/gemini-3-pro-image-preview` | `gemini-2.0-flash` |

### Files to Update (15 edge functions)

Each needs: replace hardcoded URL + LOVABLE_API_KEY with helper import.

- [ ] `ai-chat/index.ts` (~10 calls)
- [ ] `generate-content/index.ts`
- [ ] `generate-slide-images/index.ts`
- [ ] `analyze-brand-examples/index.ts`
- [ ] `analyze-image-layout/index.ts`
- [ ] `generate-template-sets/index.ts`
- [ ] `generate-download/index.ts`
- [ ] `rank-and-select/index.ts`
- [ ] `generate-style-pack/index.ts`
- [ ] `generate-image-variations/index.ts`
- [ ] `generate-image/index.ts`
- [ ] `generate-slide-backgrounds/index.ts`
- [ ] `create-visual-brief/index.ts`
- [ ] `build-image-prompts/index.ts`
- [ ] `scrape-trends/index.ts`

---

## Phase 1 — Create New Project

### Steps

1. **Lovable:** Create blank project ("Apenas uma tela branca")
2. **GitHub:** Connect blank project to NEW GitHub repo
3. **GitHub Desktop / VS Code:** Delete all files from blank repo (keep `.gitignore`)
4. **Download:** Download current `project-guidance` repo as ZIP
5. **Clean:** Remove `.env` contents (Lovable Cloud credentials)
6. **Copy:** Copy all files into blank repo
7. **Push:** Commit and push → Lovable receives the code
8. **Verify:** Lovable shows the TrendPulse UI

### Important Notes
- The `.env` file must have EMPTY values for Supabase credentials (they'll be filled by the new Supabase connection)
- The `supabase/config.toml` project_id will be updated when connecting Supabase

---

## Phase 2 — Connect Own Supabase

### Steps

1. **Supabase:** Create new project at https://supabase.com
   - Region: South America (São Paulo)
   - Note: Project ID, Anon Key, URL, Service Role Key

2. **Lovable:** Menu → Integrações → Connect Supabase
   - Select the new project

3. **Run Migrations:** In Supabase SQL Editor, run each migration file IN ORDER
   - Files are in `supabase/migrations/` (oldest first)
   - Each file creates tables, RLS policies, triggers, etc.

4. **Run SQL constraint update:**
   ```sql
   ALTER TABLE generated_contents DROP CONSTRAINT IF EXISTS generated_contents_content_type_check;
   ALTER TABLE generated_contents ADD CONSTRAINT generated_contents_content_type_check
     CHECK (content_type IN ('post', 'story', 'carousel', 'document', 'article', 'cron_config'));
   ```

### Migration Files (run in order)
Check `supabase/migrations/` directory — files are named with timestamps.
Run from oldest (top) to newest (bottom).

---

## Phase 3 — Edge Functions Deploy

### Option A: GitHub Actions (recommended)

Create file `.github/workflows/deploy-supabase-functions.yml`:

```yaml
name: Deploy Supabase Edge Functions
on:
  push:
    branches: [main]
    paths:
      - 'supabase/functions/**'
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase functions deploy --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

GitHub Secrets needed:
- `SUPABASE_PROJECT_ID` — from Supabase Dashboard → Project Settings
- `SUPABASE_ACCESS_TOKEN` — from Supabase Dashboard → Account → Access Tokens

### Option B: Supabase CLI (manual)

```bash
supabase login
supabase link --project-ref <project-id>
supabase functions deploy
```

---

## Phase 4 — Secrets (API Keys)

Configure in Supabase Dashboard → Edge Functions → Secrets:

| Secret Name | Source | Notes |
|-------------|--------|-------|
| `GOOGLE_AI_API_KEY` | Google AI Studio | Replaces LOVABLE_API_KEY |
| `INFERENCE_SH_API_KEY` | inference.sh dashboard | Image generation |
| `FIRECRAWL_API_KEY` | firecrawl.dev | Trend scraping |
| `LOVABLE_API_KEY` | Lovable (if still needed) | Legacy fallback |

---

## Phase 5 — Data Migration

### Users (auth)
- Create each user manually in Supabase Auth → Users → Create User
- Use same email addresses
- Auto-confirm each user
- Note: user IDs will be DIFFERENT — need to update references

### Tables (data)
1. Export CSV from Lovable Cloud for each table
2. Update `user_id` references with new user IDs
3. Import CSV into new Supabase

### Key tables to migrate:
- `profiles`
- `ai_user_context`
- `brands`
- `brand_examples`
- `brand_template_sets`
- `generated_contents`
- `projects`, `posts`, `slides`
- `chat_messages`
- `trends`

### Storage (images)
- Export from Lovable Cloud storage
- Upload to new Supabase storage
- Buckets: `generated-images`, `content-images`
- Note: image URLs in `generated_contents.image_urls` and `slides.image_url` will need updating

---

## Phase 6 — Configuration

### Auth URL Configuration
Supabase → Auth → URL Configuration:
- Site URL: `https://your-domain.com`
- Redirect URLs: `https://your-domain.com/*`, `http://localhost:*`

### Instagram/LinkedIn OAuth
Update callback URLs in Meta/LinkedIn developer portals to point to new Supabase function URLs.

### Cron Jobs
Re-configure external cron for:
- `instagram-scheduler` — every 60s
- `trends-scheduler` — daily at 9:00 UTC

---

## Rollback Plan

If migration fails:
1. The original Lovable Cloud project still works
2. Change `.env` back to Lovable Cloud credentials
3. Push to original repo → Lovable deploys old version

---

## Timeline Estimate

| Phase | Duration | Dependencies |
|-------|----------|-------------|
| Phase 0 (AI Gateway) | 2-3 hours | Google AI billing active |
| Phase 1 (New project) | 30 min | Phase 0 complete |
| Phase 2 (Supabase) | 1 hour | Phase 1 complete |
| Phase 3 (Edge functions) | 30 min | Phase 2 complete |
| Phase 4 (Secrets) | 15 min | Phase 3 complete |
| Phase 5 (Data) | 1-2 hours | Phase 4 complete |
| Phase 6 (Config) | 30 min | Phase 5 complete |
| **Total** | **5-7 hours** | |

---

## Post-Migration Checklist

- [ ] Login/signup works
- [ ] Content generation (link flow)
- [ ] Content generation (button flow)
- [ ] Image generation (inference.sh + Google AI fallback)
- [ ] Brand creation
- [ ] Content deletion
- [ ] Chat history persistence
- [ ] Instagram/LinkedIn publish
- [ ] Trends/suggestions
- [ ] Scheduled content
- [ ] Storage (images load correctly)

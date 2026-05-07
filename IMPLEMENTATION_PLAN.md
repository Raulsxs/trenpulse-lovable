# TrendPulse — Plano de Implementação Template-First

> Companion técnico do `REFACTOR_PLAN.md`. Cada item é executável: caminho de arquivo, código/SQL, e checkpoint de validação.
> Última atualização: 2026-05-07

## Convenções

- **Branch**: `refactor/template-first` (long-running). Merges frequentes pra `main` gated por `account_type`.
- **Migrations**: nome `YYYYMMDDHHMMSS_<descrição>.sql` em `supabase/migrations/`.
- **Edge functions**: deploy individual via `npx supabase functions deploy <name> --project-ref qdmhqxpazffmaxleyzxs`.
- **Testes**: rodar `npm test` antes de cada commit. Sessão manual com Maikon antes de cada merge para `main`.

---

## FASE 0 — Foundation

### Task 0.1 — Criar branch

```bash
git checkout -b refactor/template-first
git push -u origin refactor/template-first
```

### Task 0.2 — Migration: `account_type` na tabela users

**Arquivo:** `supabase/migrations/20260508000001_add_account_type.sql`

```sql
-- Add account_type to users table for white_glove (Maikon) vs self_serve (new) routing fork
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'white_glove';

-- Constraint
ALTER TABLE auth.users
  ADD CONSTRAINT account_type_check CHECK (account_type IN ('white_glove', 'self_serve'));

-- Maikon explicit (defensive — default already covers him but make intent clear)
UPDATE auth.users
  SET account_type = 'white_glove'
  WHERE email = 'maikon@madeira.com.br';

-- Raul explicit white_glove (admin sees current UI for now; pode trocar manual depois)
UPDATE auth.users
  SET account_type = 'white_glove'
  WHERE email = 'raul.sxs27@gmail.com';

COMMENT ON COLUMN auth.users.account_type IS
  'Routing fork: white_glove sees current UI (Maikon-era); self_serve sees template-first UI (new).';
```

> **Nota:** se `auth.users` não permitir ALTER direto via migration (RLS do Supabase), a alternativa é criar tabela `public.user_profiles` com FK `id` → `auth.users.id`, e mover `account_type` lá. Verificar antes de aplicar.

### Task 0.3 — Migration: tabela `templates`

**Arquivo:** `supabase/migrations/20260508000002_create_templates_table.sql`

```sql
CREATE TABLE public.templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  format TEXT NOT NULL,
  aspect_ratios TEXT[] NOT NULL,
  preview_url TEXT NOT NULL,
  preview_video_url TEXT,
  engine TEXT NOT NULL,
  blotato_template_id TEXT,
  prompt_template TEXT,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_slots TEXT[],
  cost_credits INT NOT NULL DEFAULT 1,
  viral_views INT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_personal BOOLEAN NOT NULL DEFAULT false,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT format_check CHECK (format IN ('post','story','linkedin','tweet','video','carousel')),
  CONSTRAINT engine_check CHECK (engine IN ('blotato','gemini','satori')),
  CONSTRAINT category_check CHECK (category IN ('infographic','slideshow','card','photo_quote','video','carousel')),
  CONSTRAINT personal_owner_required CHECK (is_personal = false OR owner_user_id IS NOT NULL)
);

CREATE INDEX idx_templates_format ON public.templates(format) WHERE is_active;
CREATE INDEX idx_templates_owner ON public.templates(owner_user_id) WHERE is_personal;
CREATE INDEX idx_templates_category ON public.templates(category) WHERE is_active;

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Curated templates (owner_user_id IS NULL) visíveis a todos autenticados
CREATE POLICY "templates_select_curated" ON public.templates
  FOR SELECT TO authenticated
  USING (is_personal = false AND is_active = true);

-- Personal templates só pro owner
CREATE POLICY "templates_select_personal" ON public.templates
  FOR SELECT TO authenticated
  USING (is_personal = true AND owner_user_id = auth.uid());

CREATE POLICY "templates_insert_personal" ON public.templates
  FOR INSERT TO authenticated
  WITH CHECK (is_personal = true AND owner_user_id = auth.uid());

CREATE POLICY "templates_update_personal" ON public.templates
  FOR UPDATE TO authenticated
  USING (is_personal = true AND owner_user_id = auth.uid());

CREATE POLICY "templates_delete_personal" ON public.templates
  FOR DELETE TO authenticated
  USING (is_personal = true AND owner_user_id = auth.uid());

-- Service role bypassa pra seed manual e admin
CREATE POLICY "templates_service_role_all" ON public.templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### Task 0.4 — Migration: FK `template_id` em `generated_contents`

**Arquivo:** `supabase/migrations/20260508000003_add_template_id_to_generated_contents.sql`

```sql
ALTER TABLE public.generated_contents
  ADD COLUMN IF NOT EXISTS template_id UUID NULL
    REFERENCES public.templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_contents_template
  ON public.generated_contents(template_id);

COMMENT ON COLUMN public.generated_contents.template_id IS
  'Template that originated this content. NULL for content created via legacy chat flow.';
```

### Task 0.5 — Hook `useAccountType`

**Arquivo:** `src/hooks/useAccountType.ts` (novo)

```typescript
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AccountType = 'white_glove' | 'self_serve';

export function useAccountType(): { accountType: AccountType | null; loading: boolean } {
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;
      if (!user) {
        setAccountType(null);
        setLoading(false);
        return;
      }
      // account_type vem do JWT app_metadata via trigger (ver Task 0.6)
      const value = (user.app_metadata?.account_type as AccountType) ?? 'white_glove';
      setAccountType(value);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  return { accountType, loading };
}
```

### Task 0.6 — Trigger pra refletir `account_type` no JWT

> **Por que:** ler `account_type` direto do JWT no front evita um round-trip ao DB toda vez que o app carrega.

**Arquivo:** `supabase/migrations/20260508000004_account_type_to_jwt.sql`

```sql
-- Função que sincroniza account_type pro app_metadata do JWT
CREATE OR REPLACE FUNCTION public.sync_account_type_to_jwt()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
    SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('account_type', NEW.account_type)
    WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_account_type
  AFTER INSERT OR UPDATE OF account_type ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_account_type_to_jwt();

-- Backfill existentes
UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('account_type', account_type);
```

### Task 0.7 — Routing fork no `App.tsx`

**Arquivo modificado:** `src/App.tsx`

Adicionar ao topo dos imports:

```typescript
import { useAccountType } from "@/hooks/useAccountType";
import SelfServePlaceholder from "./pages/SelfServePlaceholder";
```

Wrap em um componente que checa a flag (mantém `Routes` atual se white_glove, mostra placeholder se self_serve):

```typescript
const RoutedApp = () => {
  const { accountType, loading } = useAccountType();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Carregando...</div>;
  }

  // self_serve vê placeholder até Fase 1 ficar pronta
  if (accountType === 'self_serve') {
    return (
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="*" element={<SelfServePlaceholder />} />
      </Routes>
    );
  }

  // white_glove (default) — rotas atuais inalteradas
  return (
    <Routes>
      {/* ... todas as rotas atuais aqui, sem mudança ... */}
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <BackgroundGenerationProvider>
            <RoutedApp />
          </BackgroundGenerationProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);
```

### Task 0.8 — Placeholder `SelfServePlaceholder`

**Arquivo:** `src/pages/SelfServePlaceholder.tsx` (novo)

```tsx
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function SelfServePlaceholder() {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <Sparkles className="h-12 w-12 text-primary mb-4" />
      <h1 className="text-3xl font-bold mb-2">Estamos preparando algo novo pra você</h1>
      <p className="text-muted-foreground max-w-md mb-6">
        A nova experiência TrendPulse com galeria de templates virais está chegando.
        Em breve você poderá criar conteúdo a partir de templates testados e prontos pra performar.
      </p>
      <Button onClick={handleSignOut} variant="outline">Sair</Button>
    </div>
  );
}
```

### Task 0.9 — Atualizar `CLAUDE.md` do projeto

**Arquivo:** `CLAUDE.md`

- Trocar `Owner: Raul Silva` → `Owner: Raul Seixas`
- Adicionar seção curta:
  ```markdown
  ## account_type — Routing Fork
  - `white_glove` (default): UI atual (Maikon, existentes). Rotas todas em `App.tsx` no fork principal.
  - `self_serve`: nova UI template-first. Em construção via `refactor/template-first`.
  - Flag está em `auth.users.account_type`, espelhada em `app_metadata.account_type` via trigger.
  - Hook: `useAccountType()`.
  ```

### Task 0.10 — Testes Fase 0

**Arquivo:** `src/test/smoke-account-type.test.ts` (novo)

```typescript
import { describe, it, expect } from 'vitest';
// Testes de smoke do routing fork — mock do useAccountType
// Confirmar: white_glove renderiza chat home; self_serve renderiza placeholder.
```

### Checkpoint Fase 0

- [ ] `npm test` passa (28 + novos testes)
- [ ] Login como Maikon → vê chat exatamente como antes
- [ ] Conta de teste com `account_type='self_serve'` → vê placeholder
- [ ] Sem regressão em fluxos existentes (gerar conteúdo, agendar, publicar)
- [ ] PR mergeado pra `main` → Lovable atualiza produção → confirmar com Maikon

---

## FASE 1 — Template Gallery + Generator MVP

### Task 1.1 — Seed dos 10 templates iniciais

**Arquivo:** `supabase/migrations/20260515000001_seed_initial_templates.sql`

```sql
INSERT INTO public.templates (slug, name, description, category, format, aspect_ratios, preview_url, engine, blotato_template_id, input_schema, cost_credits, viral_views, brand_slots) VALUES
  ('tweet-card', 'Tweet Card', 'Quote em formato de tweet com avatar', 'card', 'post', ARRAY['1:1','4:5'],
   'https://...', 'blotato', 'tweet-card',
   '{"fields":[{"name":"author","type":"text","label":"Autor","required":true},{"name":"handle","type":"text","label":"@handle","required":true},{"name":"quote","type":"textarea","label":"Texto","required":true,"max":280},{"name":"avatar_url","type":"image","label":"Avatar","required":false}]}'::jsonb,
   0, 433000, ARRAY['avatar','accent_color']),

  ('tweet-carousel', 'Tweet Carousel', 'Carrossel de tweets sequenciais', 'carousel', 'post', ARRAY['1:1','4:5'],
   'https://...', 'blotato', 'tweet-carousel',
   '{"fields":[{"name":"author","type":"text","required":true},{"name":"handle","type":"text","required":true},{"name":"tweets","type":"array","item_type":"textarea","min":2,"max":8,"required":true}]}'::jsonb,
   0, 433000, ARRAY['avatar','accent_color']),

  ('quote-card', 'Quote Card', 'Citação minimalista', 'card', 'post', ARRAY['1:1'],
   'https://...', 'blotato', 'quote-card',
   '{"fields":[{"name":"quote","type":"textarea","required":true},{"name":"author","type":"text","required":false}]}'::jsonb,
   0, 104000, ARRAY['accent_color','background']),

  ('photo-quote', 'Quote com Foto Pessoal', 'Sua foto + frase em destaque', 'photo_quote', 'post', ARRAY['1:1','4:5','9:16'],
   'https://...', 'gemini', NULL,
   '{"fields":[{"name":"photo","type":"image","required":true,"label":"Sua foto"},{"name":"phrase","type":"textarea","required":true,"max":200},{"name":"author_name","type":"text","required":false}]}'::jsonb,
   1, NULL, ARRAY['accent_color']),

  ('newspaper-infographic', 'Newspaper Infographic', 'Layout de jornal antigo', 'infographic', 'post', ARRAY['4:5','1:1'],
   'https://...', 'blotato', 'newspaper-infographic',
   '{"fields":[{"name":"headline","type":"text","required":true},{"name":"subheadline","type":"text"},{"name":"sections","type":"array","item_type":"object","schema":{"title":"text","body":"textarea"},"min":3,"max":6}]}'::jsonb,
   1, 1100000, NULL),

  ('top-secret', 'Top Secret Infographic', 'Documento confidencial rasurado', 'infographic', 'post', ARRAY['4:5'],
   'https://...', 'blotato', 'top-secret-infographic',
   '{"fields":[{"name":"title","type":"text","required":true},{"name":"sections","type":"array","item_type":"object","schema":{"label":"text","content":"textarea","redacted":"boolean"},"min":4,"max":8}]}'::jsonb,
   1, 1300000, NULL),

  ('chalkboard', 'Chalkboard Infographic', 'Quadro-negro com guia visual', 'infographic', 'post', ARRAY['4:5'],
   'https://...', 'blotato', 'chalkboard-infographic',
   '{"fields":[{"name":"title","type":"text","required":true},{"name":"steps","type":"array","item_type":"object","schema":{"number":"number","title":"text","desc":"textarea"},"min":5,"max":10}]}'::jsonb,
   1, 1100000, NULL),

  ('image-slideshow-bold', 'Image Slideshow Bold Text', 'Slideshow com texto em destaque', 'slideshow', 'post', ARRAY['1:1','4:5'],
   'https://...', 'blotato', 'image-slideshow-bold-text',
   '{"fields":[{"name":"slides","type":"array","item_type":"object","schema":{"image":"image","text":"text"},"min":3,"max":10}]}'::jsonb,
   2, 3200000, ARRAY['accent_color']),

  ('story-9-16', 'Story 9:16', 'Story vertical para Instagram/Facebook', 'card', 'story', ARRAY['9:16'],
   'https://...', 'gemini', NULL,
   '{"fields":[{"name":"headline","type":"text","required":true},{"name":"body","type":"textarea"},{"name":"image","type":"image"}]}'::jsonb,
   1, NULL, ARRAY['accent_color','background']),

  ('billboard', 'Billboard Ad', 'Sua frase em outdoor real', 'infographic', 'post', ARRAY['1:1','4:5'],
   'https://...', 'blotato', 'billboard-infographic',
   '{"fields":[{"name":"main_text","type":"text","required":true,"max":80},{"name":"sub_text","type":"text"}]}'::jsonb,
   1, 1500000, NULL);
```

> **Pré-requisito:** mapear os `blotato_template_id` reais via API do Blotato e popular os `preview_url` corretos. Tarefa atômica antes desta migration.

### Task 1.2 — Componente `TemplateGallery`

**Arquivo:** `src/components/templates/TemplateGallery.tsx` (novo)

```tsx
type Props = {
  formatFilter?: 'post' | 'story' | 'linkedin' | 'tweet' | 'video' | 'carousel' | 'all';
  categoryFilter?: string;
  onTemplateClick: (template: Template) => void;
};
```

Layout: grid 5 colunas em desktop, 2 em mobile. Cada card:
- Preview image (16:9 thumbnail) com hover → preview_video_url se existir
- Nome + categoria
- View count (formatado: "1.5M views")
- Badge de cost_credits (0 = "Free", >0 = "X créditos")

### Task 1.3 — Componente `TemplateForm` (form dinâmico)

**Arquivo:** `src/components/templates/TemplateForm.tsx` (novo)

Renderiza inputs conforme `template.input_schema.fields`:
- `text` → `<Input>`
- `textarea` → `<Textarea>` com max chars
- `image` → upload via Supabase Storage (reusa lógica de `BrandEdit.tsx`)
- `array` → repeater dinâmico (add/remove items)
- `boolean` → `<Switch>`

Validação client-side: required, max length.

### Task 1.4 — Página `Discover`

**Arquivo:** `src/pages/Discover.tsx` (novo)

```tsx
- Header com format selector (Post / Story / LinkedIn / Tweet / Video — radio toggle)
- Tabs: "Em alta" | "Por categoria" | "Meus templates"
- TemplateGallery filtrada
- Card "+ Criar template pessoal" sempre visível (Fase 4 finaliza, mas placeholder aqui)
```

### Task 1.5 — Página `TemplateGenerator`

**Arquivo:** `src/pages/TemplateGenerator.tsx` (novo, rota `/templates/:slug`)

```tsx
- Carrega template do Supabase via slug
- 2 colunas: form (esq) | preview placeholder (dir)
- Source selector acima do form: link / PDF / texto livre / tendência
  - Se "link": fetch via Firecrawl → preencher campos automaticamente
  - Se "PDF": upload + extração de texto
  - Se "texto livre": campo grande
  - Se "tendência": modal escolhe tendência (Fase 5)
- Botão "Gerar" → chama edge function render-template
- Loading state com mensagem progressiva
- Preview renderizada → próximas etapas (Fase 2 conecta publish/schedule)
```

### Task 1.6 — Edge function `render-template`

**Arquivo:** `supabase/functions/render-template/index.ts` (novo)

```typescript
// POST { templateId, inputs, brandOverride? }
// 1. Carrega template do DB (service role)
// 2. Valida inputs contra input_schema
// 3. Roteia por engine:
//    - 'blotato' → chama blotato-proxy com blotato_template_id + inputs
//    - 'gemini' → monta prompt com prompt_template + inputs → chama generate-slide-images com customPrompt
//    - 'satori' → render local
// 4. Salva em generated_contents com template_id
// 5. Retorna { contentId, mediaUrls }
```

Reaproveita: `blotato-proxy`, `generate-slide-images`. Não reimplementa.

### Task 1.7 — Adicionar rotas no `App.tsx` (lado self_serve)

```typescript
if (accountType === 'self_serve') {
  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/discover" element={<Discover />} />
      <Route path="/templates/:slug" element={<TemplateGenerator />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
```

E em `Index.tsx` (logged-in redirect): se `account_type === 'self_serve'` redireciona pra `/discover` em vez de `/chat`.

### Task 1.8 — Migration: flip default pra novos signups

**Arquivo:** `supabase/migrations/20260522000001_flip_default_account_type.sql`

> **Aplicar SOMENTE quando Fase 2 estiver pronta.** Por enquanto, default fica `white_glove`.

```sql
ALTER TABLE auth.users
  ALTER COLUMN account_type SET DEFAULT 'self_serve';
```

### Checkpoint Fase 1

- [ ] 10 templates seedados e visíveis no `/discover` para account de teste self_serve
- [ ] Form dinâmico renderiza corretamente para cada template
- [ ] Geração via Blotato (templates 0-credit) funciona
- [ ] Geração via Gemini (photo-quote, story-9-16) funciona
- [ ] Maikon ainda inalterado

---

## FASE 2 — Last Mile (publicação/agendamento)

### Task 2.1 — Conectar preview à publicação existente

**Arquivo modificado:** `src/pages/TemplateGenerator.tsx`

Após render, mostra `<ActionCard>` (componente existente em `src/components/chat/ActionCard.tsx`) — **reaproveita 100%**: variants multi-plataforma, botões publicar/agendar, brand context, etc. Apenas passa `contentId` recém-criado.

### Task 2.2 — Brand overlay opcional

**Arquivo modificado:** `supabase/functions/render-template/index.ts`

Se template tem `brand_slots`, e usuário tem brand ativa, aplica override:
- `accent_color` → cor da marca substitui cor neutra do template
- `avatar` → foto da marca
- `background` → background da marca (se modo permitir)

### Task 2.3 — Calendar com badge de template

**Arquivo modificado:** `src/pages/Calendar.tsx` + componente do evento

Mostrar `template.name` ou `template.category` como badge no card do post agendado.

### Task 2.4 — Página `Library`

**Arquivo:** `src/pages/Library.tsx` (novo, rota `/library`)

Reaproveita lógica de `Contents.tsx` mas filtra/agrupa por template usado.

### Checkpoint Fase 2

- [ ] Loop fechado: template → form → gerar → preview com ActionCard → publicar/agendar → aparece em Library e Calendar
- [ ] Variants multi-plataforma corretas
- [ ] Maikon ainda inalterado
- [ ] Aplicar `20260522000001_flip_default_account_type.sql` (novos signups vão pra self_serve)

---

## FASE 3 — Billing por créditos

### Task 3.1 — Migration: créditos

**Arquivo:** `supabase/migrations/20260529000001_credit_system.sql`

```sql
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS credits_balance INT NOT NULL DEFAULT 10;

CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INT NOT NULL,
  reason TEXT NOT NULL,
  template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  generated_content_id UUID REFERENCES public.generated_contents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credit_tx_user ON public.credit_transactions(user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credits_select_own" ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "credits_service_role_all" ON public.credit_transactions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### Task 3.2 — Reescrever `check-usage`

**Arquivo modificado:** `supabase/functions/check-usage/index.ts`

Lógica nova:
1. Recebe `{ userId, templateId }`
2. Busca `cost_credits` do template
3. Busca `credits_balance` do user
4. Se balance >= cost: ok, débito (atomic via RPC ou função)
5. Se balance < cost: retorna `{ allowed: false, reason: 'insufficient_credits' }`

White_glove **não passa por essa checagem** (`account_type` checa antes).

### Task 3.3 — UI de saldo + paywall

**Arquivo:** `src/components/billing/CreditsBadge.tsx` (novo)

Badge no header mostrando saldo atual. Click → modal com transações recentes + botão "Comprar créditos".

### Task 3.4 — Reset mensal automático

**Arquivo:** `supabase/functions/credits-monthly-reset/index.ts` (novo)

Cron schedule via Supabase: rodar dia 1 do mês 00:00 UTC. Reseta Free tier pra 10 créditos.

### Checkpoint Fase 3

- [ ] Geração debita créditos corretamente
- [ ] Templates 0-credit não debitam
- [ ] Paywall bloqueia quando saldo zera
- [ ] Pacotes de créditos compráveis via Asaas
- [ ] Reset mensal funcionando

---

## FASE 4 — Templates pessoais simplificados

### Task 4.1 — Botão "Salvar como template"

**Arquivo modificado:** `src/components/chat/ActionCard.tsx` (ou novo wrapper no preview da Fase 2)

Ao clicar:
- Modal pede `name` + `format` (já vem pré-preenchido) + `description` (opcional)
- Insere em `templates` com `is_personal=true, owner_user_id=auth.uid()`, `engine` herdado, `prompt_template`/`inputs` salvos

### Task 4.2 — Aba "Meus templates" no Discover

**Arquivo modificado:** `src/pages/Discover.tsx`

Tab nova lista templates onde `is_personal=true AND owner_user_id=auth.uid()`.

### Checkpoint Fase 4

- [ ] Usuário gera algo → salva como template → aparece em "Meus templates" → reaplica com novo input

---

## FASE 5 — Trends como entry (v2)

> Detalhamento técnico fica para quando v1 (Fases 0–4) estiver shipping em produção e tiver tração.

---

## FASE 6 — Go-to-market

> Detalhamento técnico fica para paralelo com Fases 4–5.

---

## Apêndice — Comandos frequentes

```bash
# Deploy de uma edge function específica
npx supabase functions deploy <name> --project-ref qdmhqxpazffmaxleyzxs

# Deploy de todas as funções da Fase 0/1
npx supabase functions deploy render-template --project-ref qdmhqxpazffmaxleyzxs

# Aplicar migrations (após push pra main, Lovable não roda — precisa manual ou via CI)
npx supabase db push --project-ref qdmhqxpazffmaxleyzxs

# Smoke tests
npm test

# Branch
git checkout refactor/template-first
git pull
git push
```

## Apêndice — Rollback rápido

Se algo quebrar pro Maikon após merge pra main:

1. **Imediato:** `UPDATE auth.users SET account_type='white_glove' WHERE id = <maikon_id>` (defensivo, ele já está)
2. **Reverter routing fork:** comentar uso de `<RoutedApp>` no `App.tsx` e voltar pro `<Routes>` direto. Push pra main.
3. **Reverter migration problemática:** `npx supabase db reset --linked` (CUIDADO: dev only) ou migration reversa manual.

## Apêndice — Open tasks que não estão no plano técnico

Lista as tarefas que ainda dependem de decisão ou pesquisa antes de virarem código:

- [ ] Mapear `blotato_template_id` reais via API Blotato pra cada template do seed
- [ ] Capturar `preview_url` reais (screenshots ou hosted no Blotato)
- [ ] Definir cap de créditos pro Pro / Business
- [ ] Definir como expor o catálogo público (antes ou depois do paywall)
- [ ] Política de retenção de conteúdo gerado
- [ ] Escolher strategy de extração de texto de PDF (pdf.js no client vs edge function)

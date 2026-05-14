-- Adapta a tabela templates de produção (criada pelo Lovable UI) ao schema
-- esperado por Discover.tsx e TemplateGenerator.tsx.
-- Schema produção tem: id, name, description, blotato_template_key, blotato_template_id,
-- category, badge, is_free, sort_order, aspect_ratio, is_active, created_at
-- Schema necessário adiciona: slug, format, aspect_ratios[], preview_url, engine,
-- input_schema, cost_credits, viral_views, is_personal, updated_at
-- Idempotente: usa IF NOT EXISTS, DO $$ BEGIN...EXCEPTION, WHERE col IS NULL.

-- 1. Adiciona colunas faltando
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS format TEXT,
  ADD COLUMN IF NOT EXISTS aspect_ratios TEXT[],
  ADD COLUMN IF NOT EXISTS preview_url TEXT,
  ADD COLUMN IF NOT EXISTS preview_video_url TEXT,
  ADD COLUMN IF NOT EXISTS engine TEXT,
  ADD COLUMN IF NOT EXISTS prompt_template TEXT,
  ADD COLUMN IF NOT EXISTS input_schema JSONB,
  ADD COLUMN IF NOT EXISTS brand_slots TEXT[],
  ADD COLUMN IF NOT EXISTS cost_credits INT,
  ADD COLUMN IF NOT EXISTS viral_views INT,
  ADD COLUMN IF NOT EXISTS is_personal BOOLEAN,
  ADD COLUMN IF NOT EXISTS owner_user_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- 2. slug = blotato_template_key
UPDATE public.templates SET slug = blotato_template_key WHERE slug IS NULL;

-- 3. format por template_key
UPDATE public.templates SET format = CASE blotato_template_key
  WHEN 'tweet-minimal'          THEN 'post'
  WHEN 'quote-mono'             THEN 'post'
  WHEN 'infographic-newspaper'  THEN 'post'
  WHEN 'infographic-steampunk'  THEN 'post'
  WHEN 'infographic-chalkboard' THEN 'post'
  WHEN 'image-slideshow'        THEN 'video'
  WHEN 'video-story'            THEN 'story'
  WHEN 'quote-paper'            THEN 'post'
  WHEN 'infographic-billboard'  THEN 'post'
  WHEN 'tutorial-monocolor'     THEN 'carousel'
  ELSE 'post'
END WHERE format IS NULL;

-- 4. aspect_ratios (TEXT[]) from aspect_ratio (TEXT)
UPDATE public.templates
  SET aspect_ratios = ARRAY[aspect_ratio]
  WHERE aspect_ratios IS NULL AND aspect_ratio IS NOT NULL;
UPDATE public.templates SET aspect_ratios = ARRAY['1:1'] WHERE aspect_ratios IS NULL;

-- 5. preview_url placeholder
UPDATE public.templates
  SET preview_url = 'https://placeholder.trendpulse.com.br/' || blotato_template_key || '.png'
  WHERE preview_url IS NULL;

-- 6. engine = 'blotato' para todos
UPDATE public.templates SET engine = 'blotato' WHERE engine IS NULL;

-- 7. cost_credits de is_free
UPDATE public.templates
  SET cost_credits = CASE WHEN is_free THEN 0 ELSE 1 END
  WHERE cost_credits IS NULL;

-- 8. is_personal = false (todos são templates curados)
UPDATE public.templates SET is_personal = false WHERE is_personal IS NULL;

-- 9. updated_at = created_at
UPDATE public.templates SET updated_at = created_at WHERE updated_at IS NULL;

-- 10. viral_views estimados por template
UPDATE public.templates SET viral_views = CASE blotato_template_key
  WHEN 'tweet-minimal'          THEN 433000
  WHEN 'quote-mono'             THEN 150000
  WHEN 'infographic-newspaper'  THEN 1100000
  WHEN 'infographic-steampunk'  THEN 800000
  WHEN 'infographic-chalkboard' THEN 1100000
  WHEN 'image-slideshow'        THEN 3200000
  WHEN 'video-story'            THEN 500000
  WHEN 'quote-paper'            THEN 200000
  WHEN 'infographic-billboard'  THEN 1500000
  WHEN 'tutorial-monocolor'     THEN 600000
  ELSE NULL
END WHERE viral_views IS NULL;

-- 11. input_schema por template
UPDATE public.templates SET input_schema = CASE blotato_template_key
  WHEN 'tweet-minimal' THEN
    '{"fields":[{"name":"quote","type":"textarea","label":"Texto","required":true,"max":280},{"name":"author","type":"text","label":"Autor","required":true},{"name":"handle","type":"text","label":"@handle","required":true},{"name":"avatar_url","type":"image","label":"Avatar (URL)","required":false}]}'::jsonb
  WHEN 'quote-mono' THEN
    '{"fields":[{"name":"title","type":"text","label":"Título","required":true,"max":80},{"name":"quotes","type":"array","item_type":"textarea","label":"Citações","required":true}]}'::jsonb
  WHEN 'infographic-newspaper' THEN
    '{"fields":[{"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},{"name":"footerText","type":"text","label":"Rodapé","required":false,"max":120}]}'::jsonb
  WHEN 'infographic-steampunk' THEN
    '{"fields":[{"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},{"name":"footerText","type":"text","label":"Rodapé","required":false,"max":120}]}'::jsonb
  WHEN 'infographic-chalkboard' THEN
    '{"fields":[{"name":"description","type":"textarea","label":"Tema do post","required":true,"max":1000},{"name":"footerText","type":"text","label":"Rodapé","required":false,"max":120}]}'::jsonb
  WHEN 'image-slideshow' THEN
    '{"fields":[{"name":"slides","type":"array","item_type":"textarea","label":"Texto por slide","required":true}]}'::jsonb
  WHEN 'video-story' THEN
    '{"fields":[{"name":"slidePrompts","type":"array","item_type":"textarea","label":"Prompt por slide","required":true}]}'::jsonb
  WHEN 'quote-paper' THEN
    '{"fields":[{"name":"title","type":"text","label":"Título","required":true,"max":80},{"name":"quotes","type":"array","item_type":"textarea","label":"Citações","required":true}]}'::jsonb
  WHEN 'infographic-billboard' THEN
    '{"fields":[{"name":"description","type":"textarea","label":"Mensagem","required":true,"max":300},{"name":"footerText","type":"text","label":"Rodapé","required":false,"max":120}]}'::jsonb
  WHEN 'tutorial-monocolor' THEN
    '{"fields":[{"name":"mainTitle","type":"text","label":"Título principal","required":true,"max":80},{"name":"contentItems","type":"array","item_type":"textarea","label":"Itens","required":true},{"name":"authorName","type":"text","label":"Autor","required":true},{"name":"profileImage","type":"image","label":"Foto de perfil (URL)","required":false}]}'::jsonb
  ELSE '{"fields":[]}'::jsonb
END WHERE input_schema IS NULL;

-- 12. Aplica NOT NULL agora que dados foram populados
ALTER TABLE public.templates
  ALTER COLUMN slug SET NOT NULL,
  ALTER COLUMN format SET NOT NULL,
  ALTER COLUMN aspect_ratios SET NOT NULL,
  ALTER COLUMN preview_url SET NOT NULL,
  ALTER COLUMN engine SET NOT NULL,
  ALTER COLUMN cost_credits SET NOT NULL,
  ALTER COLUMN is_personal SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN input_schema SET NOT NULL;

-- 13. Constraint UNIQUE no slug
DO $$ BEGIN
  ALTER TABLE public.templates ADD CONSTRAINT templates_slug_key UNIQUE (slug);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 14. RLS: substitui policy permissiva por uma que inclui is_personal
DROP POLICY IF EXISTS "Anyone can view active templates" ON public.templates;

DO $$ BEGIN
  CREATE POLICY "templates_select_public" ON public.templates
    FOR SELECT USING (is_personal = false AND is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

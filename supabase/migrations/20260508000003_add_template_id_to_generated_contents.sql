-- FK opcional ligando conteúdo gerado ao template que o originou.
-- NULL para conteúdo do fluxo legacy (chat). Preenchido para conteúdo gerado via /templates/:slug (Fase 1+).

ALTER TABLE public.generated_contents
  ADD COLUMN IF NOT EXISTS template_id UUID NULL
    REFERENCES public.templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generated_contents_template
  ON public.generated_contents(template_id)
  WHERE template_id IS NOT NULL;

COMMENT ON COLUMN public.generated_contents.template_id IS
  'Template que originou esse conteúdo. NULL para conteúdo do fluxo legacy (chat).';

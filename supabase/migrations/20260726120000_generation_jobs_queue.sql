-- Fila de gerações do /agent — o usuário enfileira vários pedidos em linguagem livre e eles são
-- processados UM POR VEZ por usuário (baixo consumo), com status ao vivo num painel lateral.
--
-- Por que existe: a geração demora (~1min) e os usuários pediram pra "deixar vários rodando e sair".
-- Um turno interativo do chat trava a aba esperando; a fila desacopla isso — o pedido vira um job
-- que um worker server-side processa, e o front acompanha por realtime (padrão user_credits/ActionCard).
--
-- Fluxo do status: queued → processing → done | failed | needs_review
--   - needs_review: o agente decidiu executar uma ação IRREVERSÍVEL (publicar/agendar). O worker NÃO
--     executa isso sozinho na fila — para e devolve pro usuário finalizar no chat (retomando o job).

CREATE TABLE IF NOT EXISTS public.generation_jobs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt       TEXT        NOT NULL,                    -- pedido em linguagem livre (o que o usuário digitou)
  brand_id     UUID        REFERENCES public.brands(id) ON DELETE SET NULL,
  model        TEXT,                                    -- modelo de imagem escolhido (seedream/gpt-image-2/nano-banana)
  status       TEXT        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','done','failed','needs_review','canceled')),
  content_id   UUID        REFERENCES public.generated_contents(id) ON DELETE SET NULL, -- resultado
  title        TEXT,                                    -- rótulo curto pro painel (derivado do prompt)
  error        TEXT,                                    -- motivo da falha (pro usuário entender)
  resume       JSONB,                                   -- estado p/ retomar um needs_review no chat (messages + tool pendente)
  attempts     INT         NOT NULL DEFAULT 0,          -- nº de tentativas do worker (backoff/limite)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;

-- Dono lê os próprios jobs (alimenta o painel lateral via realtime).
DO $$ BEGIN
  CREATE POLICY "generation_jobs_select_own" ON public.generation_jobs
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dono enfileira os próprios jobs. Só campos "de pedido" — status/content_id/resume ficam a cargo
-- do worker (service_role). O WITH CHECK garante que o usuário não cria job em nome de outro nem
-- injeta um status já "processing"/"done".
DO $$ BEGIN
  CREATE POLICY "generation_jobs_insert_own" ON public.generation_jobs
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND status = 'queued');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dono pode cancelar/limpar os próprios jobs (o painel tem "cancelar" e "limpar concluídos").
-- Só permite mexer nos que ainda estão na fila ou já terminaram — NÃO num 'processing' (senão
-- brigaria com o worker no meio da geração).
DO $$ BEGIN
  CREATE POLICY "generation_jobs_update_own" ON public.generation_jobs
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id AND status IN ('queued','done','failed','needs_review'))
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "generation_jobs_delete_own" ON public.generation_jobs
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- service_role (worker) faz tudo — pega o próximo job, trava, grava resultado.
DO $$ BEGIN
  CREATE POLICY "generation_jobs_all_service" ON public.generation_jobs
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índice do worker: pega o job 'queued' mais antigo de um usuário (FIFO por usuário).
CREATE INDEX IF NOT EXISTS idx_generation_jobs_worker
  ON public.generation_jobs(user_id, status, created_at);

-- Índice do painel: lista os jobs recentes do usuário.
CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_recent
  ON public.generation_jobs(user_id, created_at DESC);

-- updated_at automático (o painel ordena/mostra por atualização).
CREATE OR REPLACE FUNCTION public.touch_generation_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generation_jobs_updated_at ON public.generation_jobs;
CREATE TRIGGER trg_generation_jobs_updated_at
  BEFORE UPDATE ON public.generation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_generation_jobs_updated_at();

-- Realtime: sem a tabela na publication, o painel lateral não recebe os UPDATEs de status e só
-- mudaria no refresh. A policy de SELECT "own" já restringe o realtime à própria linha.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'generation_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_jobs;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: payload do realtime traz a linha completa em UPDATEs (status + content_id).
ALTER TABLE public.generation_jobs REPLICA IDENTITY FULL;

-- RPC: pega e TRAVA o próximo job 'queued' de um usuário num passo atômico (evita 2 workers
-- pegarem o mesmo job). FOR UPDATE SKIP LOCKED = concorrência segura. Só 1 job 'processing' por
-- usuário por vez (o guard abaixo) → sequencial, baixo consumo. SECURITY DEFINER + revogado de
-- PUBLIC: só o worker (service_role) chama.
CREATE OR REPLACE FUNCTION public.claim_next_job(p_user UUID)
RETURNS public.generation_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.generation_jobs;
BEGIN
  -- Já tem um job desse usuário em processamento? Não pega outro (1 por vez).
  IF EXISTS (SELECT 1 FROM public.generation_jobs WHERE user_id = p_user AND status = 'processing') THEN
    RETURN NULL;
  END IF;

  SELECT * INTO j FROM public.generation_jobs
    WHERE user_id = p_user AND status = 'queued'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

  IF j.id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.generation_jobs
    SET status = 'processing', started_at = now(), attempts = attempts + 1
    WHERE id = j.id
    RETURNING * INTO j;
  RETURN j;
END; $$;

REVOKE ALL ON FUNCTION public.claim_next_job(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_job(UUID) TO service_role;

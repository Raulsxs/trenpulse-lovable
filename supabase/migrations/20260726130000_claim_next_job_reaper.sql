-- Reaper na claim_next_job: recupera jobs órfãos em 'processing' (worker morto no wall-clock da edge
-- antes de finalizar) — senão o job ficaria preso pra sempre e a fila do usuário travaria.
-- Regra: um job em 'processing' há mais de 4min quase certamente morreu (geração real leva ~2min).
--   - attempts < 3 → volta pra 'queued' (o worker/cron re-tenta).
--   - attempts >= 3 → 'failed' (evita loop infinito de re-tentativa).
-- Roda ANTES de checar se há processing ativo, pra não bloquear a fila por causa de um zumbi.

CREATE OR REPLACE FUNCTION public.claim_next_job(p_user UUID)
RETURNS public.generation_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.generation_jobs;
BEGIN
  -- Reaper: recupera jobs travados (worker morto no meio da geração).
  UPDATE public.generation_jobs
    SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
        error  = CASE WHEN attempts >= 3 THEN 'Excedeu tentativas (timeout repetido do worker)' ELSE error END,
        finished_at = CASE WHEN attempts >= 3 THEN now() ELSE finished_at END
    WHERE user_id = p_user AND status = 'processing'
      AND started_at < now() - interval '4 minutes';

  -- Já tem um job desse usuário em processamento (recente e vivo)? Não pega outro (1 por vez).
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

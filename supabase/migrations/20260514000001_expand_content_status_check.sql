-- Expand generated_contents.status CHECK constraint to allow transient publish states.
--
-- Why: the publish pipeline writes 'processing' (publish-postforme when PFM is pending),
-- 'publishing' (instagram-scheduler optimistic lock) and 'failed' (max retries reached).
-- The old constraint rejected those updates, so the row silently stayed as 'scheduled'
-- and the cron picked it up again every tick — causing the duplicate-publish bug
-- (Felipe LinkedIn 2026-04-27, Maikon 2026-05-14).
ALTER TABLE public.generated_contents
  DROP CONSTRAINT IF EXISTS generated_contents_status_check;

ALTER TABLE public.generated_contents
  ADD CONSTRAINT generated_contents_status_check
  CHECK (status = ANY (ARRAY[
    'draft','approved','scheduled','published','rejected','ready','downloaded',
    'processing','publishing','failed'
  ]));

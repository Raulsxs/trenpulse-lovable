-- Recurring publishing schedules: same content posted on a weekly cadence (e.g. Stories every day,
-- LinkedIn every Monday). The instagram-scheduler cron picks these up and clones the source content
-- into a one-shot scheduled entry in generated_contents at the configured day/hour.

CREATE TABLE IF NOT EXISTS public.recurring_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id UUID NOT NULL REFERENCES public.generated_contents(id) ON DELETE CASCADE,
  name TEXT,
  platforms TEXT[] NOT NULL DEFAULT ARRAY['instagram']::TEXT[],
  -- 0=Sunday, 1=Monday, ..., 6=Saturday (matches Postgres extract(dow))
  days_of_week INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
  hour_utc INTEGER NOT NULL DEFAULT 12 CHECK (hour_utc >= 0 AND hour_utc <= 23),
  -- Random offset (0-jitter_minutes) added to the spawned scheduled_at to avoid posting at
  -- the exact same minute every day, which can trip platform anti-bot heuristics.
  jitter_minutes INTEGER NOT NULL DEFAULT 15 CHECK (jitter_minutes >= 0 AND jitter_minutes <= 120),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_schedules_user ON public.recurring_schedules(user_id, active);
CREATE INDEX IF NOT EXISTS idx_recurring_schedules_active_due
  ON public.recurring_schedules(active, hour_utc)
  WHERE active = TRUE;

ALTER TABLE public.recurring_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_recurring" ON public.recurring_schedules;
CREATE POLICY "users_select_own_recurring"
  ON public.recurring_schedules FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_recurring" ON public.recurring_schedules;
CREATE POLICY "users_insert_own_recurring"
  ON public.recurring_schedules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_recurring" ON public.recurring_schedules;
CREATE POLICY "users_update_own_recurring"
  ON public.recurring_schedules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_recurring" ON public.recurring_schedules;
CREATE POLICY "users_delete_own_recurring"
  ON public.recurring_schedules FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_recurring_schedules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_schedules_updated_at ON public.recurring_schedules;
CREATE TRIGGER trg_recurring_schedules_updated_at
  BEFORE UPDATE ON public.recurring_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_recurring_schedules_updated_at();

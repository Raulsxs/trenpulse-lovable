CREATE OR REPLACE FUNCTION get_cron_users_due()
RETURNS TABLE (
  user_id uuid,
  whatsapp_number text,
  business_niche text,
  brand_voice text,
  content_topics text[],
  extra_context jsonb,
  qty_suggestions int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.user_id,
    u.whatsapp_number,
    u.business_niche,
    u.brand_voice,
    u.content_topics,
    u.extra_context,
    c.qty_suggestions
  FROM ai_cron_config c
  JOIN ai_user_context u ON u.user_id = c.user_id
  WHERE c.active = true
    AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'UTC')::int = ANY(c.days_of_week)
    AND EXTRACT(HOUR FROM NOW() AT TIME ZONE 'UTC')::int = c.hour_utc
    AND (
      c.last_run_at IS NULL 
      OR c.last_run_at < NOW() - INTERVAL '20 hours'
    )
    AND u.onboarding_done = true;
$$;

GRANT EXECUTE ON FUNCTION get_cron_users_due() TO anon;
GRANT EXECUTE ON FUNCTION get_cron_users_due() TO authenticated;
-- Content Metrics — cached engagement data from Instagram/LinkedIn
CREATE TABLE IF NOT EXISTS content_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id uuid REFERENCES generated_contents(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users NOT NULL,
  platform text NOT NULL,           -- 'instagram', 'linkedin'
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  engagement_rate numeric(5,2) DEFAULT 0,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(content_id)
);

ALTER TABLE content_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own metrics"
  ON content_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages metrics"
  ON content_metrics FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_content_metrics_user ON content_metrics (user_id);
CREATE INDEX IF NOT EXISTS idx_content_metrics_content ON content_metrics (content_id);

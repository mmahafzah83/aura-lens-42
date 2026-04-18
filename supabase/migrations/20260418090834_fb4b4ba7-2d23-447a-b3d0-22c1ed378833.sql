ALTER TABLE public.industry_trends
  ADD COLUMN IF NOT EXISTS confidence_level text,
  ADD COLUMN IF NOT EXISTS opportunity_type text,
  ADD COLUMN IF NOT EXISTS action_recommendation text,
  ADD COLUMN IF NOT EXISTS content_angle text,
  ADD COLUMN IF NOT EXISTS signal_type text,
  ADD COLUMN IF NOT EXISTS snapshot_quality integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS decision_label text;

-- Backfill defaults so existing trends keep rendering
UPDATE public.industry_trends
SET
  confidence_level    = COALESCE(confidence_level, 'Medium'),
  opportunity_type    = COALESCE(opportunity_type, 'Content'),
  signal_type         = COALESCE(signal_type, 'Trend'),
  decision_label      = COALESCE(decision_label,
                          CASE
                            WHEN impact_level = 'High' THEN 'Act Now'
                            WHEN impact_level = 'Emerging' THEN 'Early Opportunity'
                            ELSE 'Monitor'
                          END),
  snapshot_quality    = COALESCE(NULLIF(snapshot_quality, 0), LEAST(100, GREATEST(0, COALESCE(validation_score, 0)))),
  is_valid            = COALESCE(is_valid, true)
WHERE confidence_level IS NULL
   OR opportunity_type IS NULL
   OR signal_type IS NULL
   OR decision_label IS NULL;

CREATE INDEX IF NOT EXISTS idx_industry_trends_user_valid_score
  ON public.industry_trends (user_id, is_valid, final_score DESC);
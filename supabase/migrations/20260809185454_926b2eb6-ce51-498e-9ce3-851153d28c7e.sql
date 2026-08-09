ALTER TABLE public.voice_post_outcomes
  ADD COLUMN IF NOT EXISTS outcome_source text,
  ADD COLUMN IF NOT EXISTS total_engagement integer,
  ADD COLUMN IF NOT EXISTS baseline_total_engagement numeric;

ALTER TABLE public.voice_post_outcomes
  DROP CONSTRAINT IF EXISTS voice_post_outcomes_outcome_source_check;

ALTER TABLE public.voice_post_outcomes
  ADD CONSTRAINT voice_post_outcomes_outcome_source_check
  CHECK (outcome_source IS NULL OR outcome_source IN ('metrics_snapshot','post_counts'));

COMMENT ON COLUMN public.voice_post_outcomes.outcome_source IS
  'Where the performance figures came from: metrics_snapshot (richer, carries impressions) or post_counts (like/comment/repost stored on linkedin_posts). Baselines are computed within one source only.';
COMMENT ON COLUMN public.voice_post_outcomes.total_engagement IS
  'likes + comments + reposts. Used for the engagement-volume index when impressions are unavailable.';
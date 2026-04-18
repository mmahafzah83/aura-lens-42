ALTER TABLE public.industry_trends
  ADD COLUMN IF NOT EXISTS content_text text,
  ADD COLUMN IF NOT EXISTS validation_score integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_industry_trends_validation_score
  ON public.industry_trends (user_id, validation_score DESC, fetched_at DESC);
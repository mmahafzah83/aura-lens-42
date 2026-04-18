ALTER TABLE public.industry_trends
  ADD COLUMN IF NOT EXISTS topic_relevance_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_score numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_industry_trends_final_score
  ON public.industry_trends (user_id, final_score DESC, fetched_at DESC);
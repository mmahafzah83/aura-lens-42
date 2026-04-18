
ALTER TABLE public.industry_trends
  ADD COLUMN IF NOT EXISTS content_raw text,
  ADD COLUMN IF NOT EXISTS content_clean text,
  ADD COLUMN IF NOT EXISTS content_quality_score integer NOT NULL DEFAULT 0;

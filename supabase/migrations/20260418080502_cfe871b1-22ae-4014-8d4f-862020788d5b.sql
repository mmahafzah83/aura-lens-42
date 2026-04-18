
ALTER TABLE public.industry_trends
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS content_markdown text,
  ADD COLUMN IF NOT EXISTS summary text,
  ADD COLUMN IF NOT EXISTS relevance_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

ALTER TABLE public.industry_trends
  ALTER COLUMN url DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_industry_trends_user_status_fetched
  ON public.industry_trends (user_id, status, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_industry_trends_canonical_url
  ON public.industry_trends (user_id, canonical_url);

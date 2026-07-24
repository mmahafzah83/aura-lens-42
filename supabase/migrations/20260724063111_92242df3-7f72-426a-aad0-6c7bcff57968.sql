-- Column marking a real publish attempt from any client call site.
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS publish_attempted_at timestamptz;

-- Backfill: retired card-share orphans (failed with acquisition marker) get their created_at
-- so historical failures remain observable. DRAFT rows are intentionally NOT backfilled —
-- they were never attempted and must not appear as stuck.
UPDATE public.linkedin_posts
   SET publish_attempted_at = created_at
 WHERE acquisition = 'published_via_aura'
   AND tracking_status = 'failed'
   AND publish_attempted_at IS NULL;

-- Daily ratio history for the self-calibrating funnel_trend assertion.
CREATE TABLE IF NOT EXISTS public.funnel_daily_ratio (
  day date PRIMARY KEY,
  opens_users int NOT NULL DEFAULT 0,
  signals_users int NOT NULL DEFAULT 0,
  ratio numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.funnel_daily_ratio TO service_role;

ALTER TABLE public.funnel_daily_ratio ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.
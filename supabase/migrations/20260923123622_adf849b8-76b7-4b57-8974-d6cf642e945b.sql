
-- 1. Every link the engine has judged, remembered.
CREATE TABLE IF NOT EXISTS public.oe_seen_links (
  canonical_url text PRIMARY KEY,
  feed_id uuid,
  verdict text NOT NULL CHECK (verdict IN ('opportunity','not_opportunity','past','aggregator','no_quote','too_short','junior_title','error')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  times_seen int NOT NULL DEFAULT 1
);
GRANT ALL ON public.oe_seen_links TO service_role;
ALTER TABLE public.oe_seen_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.oe_seen_links FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS oe_seen_links_feed_idx ON public.oe_seen_links (feed_id);

-- 2. Fingerprint of a listing page's job links.
ALTER TABLE public.oe_feeds ADD COLUMN IF NOT EXISTS links_fingerprint text;

-- 3. A candidate may leave the backlog for being too junior.
ALTER TABLE public.oe_candidates DROP CONSTRAINT IF EXISTS oe_candidates_triage_state_check;
ALTER TABLE public.oe_candidates ADD CONSTRAINT oe_candidates_triage_state_check
  CHECK (triage_state = ANY (ARRAY['new','passed','rejected','read','error','junior_title']));

-- 4. The 442 careers pages become fetchable listing pages, read daily.
UPDATE public.oe_feeds SET kind = 'listing', cadence = 'daily'
WHERE source_type = 'careers_page' AND (kind <> 'listing' OR cadence <> 'daily');

-- 5. Claim several jobs at once, atomically.
CREATE OR REPLACE FUNCTION public.claim_jobs(p_job_types text[], p_worker text, p_limit int DEFAULT 8)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.job_queue
    WHERE job_type = ANY(p_job_types)
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT GREATEST(1, LEAST(coalesce(p_limit, 8), 32))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue q
  SET status = 'claimed',
      claimed_at = now(),
      claimed_by = p_worker,
      attempts = q.attempts + 1,
      updated_at = now()
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$function$;
REVOKE ALL ON FUNCTION public.claim_jobs(text[], text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_jobs(text[], text, int) TO service_role;

-- The raw pool: everything a source offers, before any model is paid to read it.
CREATE TABLE public.oe_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES public.oe_feeds(id) ON DELETE SET NULL,
  url text NOT NULL,
  canonical_url text,
  title text,
  snippet text,
  published_at timestamptz,
  lang text,
  content_hash text,
  embedding vector(1536),
  triage_score numeric,
  triage_state text NOT NULL DEFAULT 'new'
    CHECK (triage_state IN ('new','passed','rejected','read','error')),
  rejected_reason text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.oe_candidates TO service_role;
ALTER TABLE public.oe_candidates ENABLE ROW LEVEL SECURITY;
-- Machine table: no member policies. Only the service role reaches it.
CREATE POLICY "Admins can read candidates" ON public.oe_candidates
  FOR SELECT TO authenticated USING (is_current_user_admin());

CREATE UNIQUE INDEX oe_candidates_canonical_url_idx
  ON public.oe_candidates (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX oe_candidates_content_hash_idx ON public.oe_candidates (content_hash);
CREATE INDEX oe_candidates_state_score_idx ON public.oe_candidates (triage_state, triage_score DESC);
CREATE INDEX oe_candidates_embedding_idx
  ON public.oe_candidates USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER oe_candidates_set_updated_at BEFORE UPDATE ON public.oe_candidates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Source health, and the selector the harvester needs for plain HTML lists.
ALTER TABLE public.oe_feeds
  ADD COLUMN IF NOT EXISTS list_selector text,
  ADD COLUMN IF NOT EXISTS harvest_yield numeric,
  ADD COLUMN IF NOT EXISTS read_yield numeric;

ALTER TABLE public.oe_feeds DROP CONSTRAINT IF EXISTS oe_feeds_kind_check;
ALTER TABLE public.oe_feeds ADD CONSTRAINT oe_feeds_kind_check CHECK (kind = ANY (ARRAY[
  'rss','atom','sitemap','listing','html_list','api','json_api','telegram','calendar','manual','member_forward'
]));

-- One live reading job per candidate.
CREATE UNIQUE INDEX job_queue_oe_read_candidate_live_idx
  ON public.job_queue ((payload->>'candidate_id'))
  WHERE job_type = 'oe_read_candidate' AND status IN ('pending','claimed');

UPDATE public.oe_policy_versions
SET params = params || jsonb_build_object('triage_min', 0.30, 'read_budget_per_night', 120, 'triage_batch', 200)
WHERE active;
-- 1 · one vocabulary, enforced -------------------------------------------
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS made_by text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS arrived_by text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS produced_by text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS model_used text;

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS made_by text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS arrived_by text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS confidence text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS produced_by text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS model_used text;

ALTER TABLE public.linkedin_posts
  ADD CONSTRAINT linkedin_posts_made_by_check CHECK (made_by IN ('member','aura','aura_edited_by_member','machine','unknown')),
  ADD CONSTRAINT linkedin_posts_arrived_by_check CHECK (arrived_by IN ('published_through_aura','imported_by_member','discovered_by_search','entered_by_member','generated_in_place','unknown')),
  ADD CONSTRAINT linkedin_posts_confidence_check CHECK (confidence IN ('confirmed','reported','guessed','unknown')),
  ADD CONSTRAINT linkedin_posts_produced_by_check CHECK (produced_by IS NULL OR produced_by IN ('composer','weekly_drafts','overnight_agent','carousel_studio'));

ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_made_by_check CHECK (made_by IN ('member','aura','aura_edited_by_member','machine','unknown')),
  ADD CONSTRAINT content_items_arrived_by_check CHECK (arrived_by IN ('published_through_aura','imported_by_member','discovered_by_search','entered_by_member','generated_in_place','unknown')),
  ADD CONSTRAINT content_items_confidence_check CHECK (confidence IN ('confirmed','reported','guessed','unknown')),
  ADD CONSTRAINT content_items_produced_by_check CHECK (produced_by IS NULL OR produced_by IN ('composer','weekly_drafts','overnight_agent','carousel_studio'));

COMMENT ON COLUMN public.linkedin_posts.made_by IS 'Who wrote it. One vocabulary shared with content_items.';
COMMENT ON COLUMN public.content_items.made_by IS 'Who wrote it. One vocabulary shared with linkedin_posts.';

-- 3 · lineage --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_lineage (
  id bigserial PRIMARY KEY,
  content_table text NOT NULL CHECK (content_table IN ('linkedin_posts','content_items')),
  content_id uuid NOT NULL,
  contributor_kind text NOT NULL CHECK (contributor_kind IN ('signal','capture','evidence_fragment','document','trend','voice_profile')),
  contributor_id uuid,
  role text NOT NULL CHECK (role IN ('topic','evidence','number','background','timing','voice')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS content_lineage_unique
  ON public.content_lineage (content_table, content_id, contributor_kind, contributor_id, role);
CREATE INDEX IF NOT EXISTS content_lineage_content_idx
  ON public.content_lineage (content_table, content_id);

COMMENT ON TABLE public.content_lineage IS 'What went into a piece of content. Written at creation time, never inferred later.';

GRANT SELECT ON public.content_lineage TO authenticated;
GRANT ALL ON public.content_lineage TO service_role;
ALTER TABLE public.content_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read lineage for their own content"
ON public.content_lineage FOR SELECT TO authenticated
USING (
  (content_table = 'linkedin_posts' AND EXISTS (
     SELECT 1 FROM public.linkedin_posts p WHERE p.id = content_lineage.content_id AND p.user_id = auth.uid()))
  OR (content_table = 'content_items' AND EXISTS (
     SELECT 1 FROM public.content_items c WHERE c.id = content_lineage.content_id AND c.user_id = auth.uid()))
);

CREATE POLICY "Admins read all lineage"
ON public.content_lineage FOR SELECT TO authenticated
USING (public.is_current_user_admin());

-- 4 · a job declares its own outcome ---------------------------------------
ALTER TABLE public.freshness_checks ADD COLUMN IF NOT EXISTS owning_job text;

COMMENT ON TABLE public.freshness_checks IS
  'The rule: a scheduled job that produces output MUST have a row here naming the job (owning_job) and the table where that output lands. A job with no row here has no declared outcome and is invisible to review — see public.jobs_without_outcome_checks.';

CREATE OR REPLACE VIEW public.jobs_without_outcome_checks
WITH (security_invoker = on) AS
SELECT j.jobid, j.jobname, j.schedule
FROM cron.job j
WHERE j.active
  AND NOT EXISTS (
    SELECT 1 FROM public.freshness_checks f
    WHERE f.owning_job = j.jobname
  )
  AND public.is_current_user_admin();

GRANT SELECT ON public.jobs_without_outcome_checks TO authenticated;
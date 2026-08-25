-- member_drafts — Aura-written drafts still waiting for the member.
-- COUNTS: content_items rows made by Aura with status 'draft'.
-- EXCLUDES BY CONSTRUCTION: discarded rows (including the house-voice archive
-- stamped generation_params->>'archived_reason'), and anything already published.
CREATE OR REPLACE VIEW public.member_drafts
WITH (security_invoker = true) AS
SELECT *
  FROM public.content_items
 WHERE made_by = 'aura'
   AND status = 'draft';

-- member_own_posts — the member's own real writing, and nothing else.
-- COUNTS: linkedin_posts authored by the member with real body text.
-- EXCLUDES: search/SERP snippets (text_is_snippet), Aura-drafted posts, and the
-- 223 linkedin_export shells whose post_text is NULL or trivially short — those
-- would inflate any naive count of "what this member has written".
CREATE OR REPLACE VIEW public.member_own_posts
WITH (security_invoker = true) AS
SELECT *
  FROM public.linkedin_posts
 WHERE authorship = 'user_written'
   AND text_is_snippet IS NOT TRUE
   AND post_text IS NOT NULL
   AND length(post_text) > 250;

-- member_published — posts actually published through Aura.
-- COUNTS: linkedin_posts that reached tracking_status 'published' and carry a
-- published_at stamp.
-- EXCLUDES: drafts, failed publish attempts, discovered/imported history, and
-- external references that were never sent from Aura.
CREATE OR REPLACE VIEW public.member_published
WITH (security_invoker = true) AS
SELECT *
  FROM public.linkedin_posts
 WHERE tracking_status = 'published'
   AND published_at IS NOT NULL;

GRANT SELECT ON public.member_drafts TO authenticated;
GRANT SELECT ON public.member_own_posts TO authenticated;
GRANT SELECT ON public.member_published TO authenticated;
GRANT ALL ON public.member_drafts TO service_role;
GRANT ALL ON public.member_own_posts TO service_role;
GRANT ALL ON public.member_published TO service_role;

-- Pause the weekly house-voice draft writers. Reversible in one line each.
-- RE-ENABLE (one line): SELECT cron.alter_job(jobid, active := true) FROM cron.job
--   WHERE jobname LIKE 'prepare-weekly-drafts-monday%';
SELECT cron.alter_job(jobid, active := false)
  FROM cron.job
 WHERE jobname IN (
   'prepare-weekly-drafts-monday',
   'prepare-weekly-drafts-monday-t2',
   'prepare-weekly-drafts-monday-t3'
 );

ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS authorship  text,
  ADD COLUMN IF NOT EXISTS acquisition text;

-- Backfill from existing source_type — no guessing
UPDATE public.linkedin_posts
   SET authorship  = 'aura_drafted',
       acquisition = 'published_via_aura'
 WHERE source_type = 'aura_generated' AND authorship IS NULL;

UPDATE public.linkedin_posts
   SET authorship  = 'user_written',
       acquisition = 'imported'
 WHERE source_type = 'linkedin_export' AND authorship IS NULL;

UPDATE public.linkedin_posts
   SET authorship  = 'unknown',
       acquisition = 'discovered'
 WHERE source_type = 'search_discovery' AND authorship IS NULL;

-- Defensive: any source_type outside the four above stays NULL so we can spot them.

ALTER TABLE public.linkedin_posts
  DROP CONSTRAINT IF EXISTS linkedin_posts_authorship_check,
  DROP CONSTRAINT IF EXISTS linkedin_posts_acquisition_check;

ALTER TABLE public.linkedin_posts
  ADD CONSTRAINT linkedin_posts_authorship_check
    CHECK (authorship IS NULL OR authorship IN ('user_written','aura_drafted','aura_assisted','unknown'));

ALTER TABLE public.linkedin_posts
  ADD CONSTRAINT linkedin_posts_acquisition_check
    CHECK (acquisition IS NULL OR acquisition IN ('published_via_aura','imported','discovered','api_synced'));

CREATE INDEX IF NOT EXISTS linkedin_posts_authorship_idx  ON public.linkedin_posts (user_id, authorship);
CREATE INDEX IF NOT EXISTS linkedin_posts_acquisition_idx ON public.linkedin_posts (user_id, acquisition);

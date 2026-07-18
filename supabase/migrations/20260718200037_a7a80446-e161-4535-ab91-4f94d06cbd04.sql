
ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_authorship_check;
ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_acquisition_check;

ALTER TABLE public.linkedin_posts
  ADD CONSTRAINT linkedin_posts_authorship_check
  CHECK (authorship IN ('user_written','aura_drafted','aura_assisted','unknown','unset'));

ALTER TABLE public.linkedin_posts
  ADD CONSTRAINT linkedin_posts_acquisition_check
  CHECK (acquisition IN ('published_via_aura','imported','discovered','api_synced','unset'));

ALTER TABLE public.linkedin_posts ALTER COLUMN authorship SET DEFAULT 'unset';
ALTER TABLE public.linkedin_posts ALTER COLUMN acquisition SET DEFAULT 'unset';

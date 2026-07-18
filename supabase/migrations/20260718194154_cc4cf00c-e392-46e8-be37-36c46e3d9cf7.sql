-- 1) Backfill NULLs
UPDATE public.linkedin_posts
   SET authorship = 'aura_drafted'
 WHERE authorship IS NULL
   AND source_type = 'aura_generated';

UPDATE public.linkedin_posts
   SET acquisition = 'published_via_aura'
 WHERE acquisition IS NULL
   AND source_type = 'aura_generated';

UPDATE public.linkedin_posts
   SET authorship = 'unknown'
 WHERE authorship IS NULL;

UPDATE public.linkedin_posts
   SET acquisition = 'discovered'
 WHERE acquisition IS NULL;

-- 2) Defaults so future inserts that forget the field land in an honestly-labelled bucket
ALTER TABLE public.linkedin_posts
  ALTER COLUMN authorship  SET DEFAULT 'unknown',
  ALTER COLUMN acquisition SET DEFAULT 'discovered';

-- 3) Enforce NOT NULL at the DB level
ALTER TABLE public.linkedin_posts
  ALTER COLUMN authorship  SET NOT NULL,
  ALTER COLUMN acquisition SET NOT NULL;
-- 1. Review state for every post Aura might read.
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS voice_corpus_status text
    CHECK (voice_corpus_status IN ('included','excluded','auto_excluded')),
  ADD COLUMN IF NOT EXISTS voice_corpus_reason text;

COMMENT ON COLUMN public.linkedin_posts.voice_corpus_status IS
  'Whether this post counts as the member''s own writing for voice measurement. auto_excluded = the importer rejected it; excluded = the member rejected it.';
COMMENT ON COLUMN public.linkedin_posts.voice_corpus_reason IS
  'Plain-English reason shown next to an auto_excluded post.';

-- Default from the authorship / acquisition logic already in force.
UPDATE public.linkedin_posts SET
  voice_corpus_status = CASE
    WHEN post_text IS NULL OR length(trim(post_text)) <= 50 THEN 'auto_excluded'
    WHEN COALESCE(authorship,'unknown') = 'aura_drafted' THEN 'auto_excluded'
    WHEN COALESCE(acquisition,'unset') = 'discovered' THEN 'auto_excluded'
    WHEN COALESCE(source_type,'') IN ('search_discovery','aura_generated') THEN 'auto_excluded'
    ELSE 'included'
  END,
  voice_corpus_reason = CASE
    WHEN post_text IS NULL OR length(trim(post_text)) <= 50 THEN 'Too short to read'
    WHEN COALESCE(authorship,'unknown') = 'aura_drafted' THEN 'Written by Aura'
    WHEN COALESCE(acquisition,'unset') = 'discovered' THEN 'Not yours — found while searching'
    WHEN COALESCE(source_type,'') IN ('search_discovery','aura_generated') THEN 'Not yours — found while searching'
    ELSE NULL
  END
WHERE voice_corpus_status IS NULL;

ALTER TABLE public.linkedin_posts ALTER COLUMN voice_corpus_status SET DEFAULT 'included';

CREATE INDEX IF NOT EXISTS idx_linkedin_posts_corpus
  ON public.linkedin_posts (user_id, voice_corpus_status);

-- 2. The window must obey the member's exclusions, or the review surface is theatre.
CREATE OR REPLACE FUNCTION public.voice_window(p_user_id uuid)
RETURNS TABLE (
  id uuid, post_text text, hook_style text, ending_type text,
  published_at timestamptz, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.id, l.post_text, l.hook_style, l.ending_type, l.published_at, l.created_at
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') NOT IN ('search_discovery','aura_generated')
    AND COALESCE(l.voice_corpus_status,'included') <> 'excluded'
  ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC
  LIMIT 12;
$$;

-- 3. One home for the LinkedIn address. Never overwrite an address that is already there.
UPDATE public.linkedin_connections c
SET profile_url = 'https://www.linkedin.com/in/' || regexp_replace(
      COALESCE(NULLIF(trim(p.linkedin_handle),''), NULLIF(trim(p.linkedin_url),'')),
      '^.*/in/|/+$', '', 'g'),
    handle = regexp_replace(
      COALESCE(NULLIF(trim(p.linkedin_handle),''), NULLIF(trim(p.linkedin_url),'')),
      '^.*/in/|/+$', '', 'g')
FROM public.diagnostic_profiles p
WHERE p.user_id = c.user_id
  AND NULLIF(trim(COALESCE(c.profile_url,'')),'') IS NULL
  AND NULLIF(trim(COALESCE(c.handle,'')),'') IS NULL
  AND COALESCE(NULLIF(trim(p.linkedin_handle),''), NULLIF(trim(p.linkedin_url),'')) IS NOT NULL;

-- Fill a missing handle from an address we already hold.
UPDATE public.linkedin_connections
SET handle = regexp_replace(profile_url, '^.*/in/|/+$', '', 'g')
WHERE NULLIF(trim(COALESCE(handle,'')),'') IS NULL
  AND profile_url ILIKE '%/in/%';

COMMENT ON COLUMN public.diagnostic_profiles.linkedin_url IS
  'DEPRECATED — linkedin_connections.profile_url is the single source of truth. Do not write here.';
COMMENT ON COLUMN public.diagnostic_profiles.linkedin_handle IS
  'DEPRECATED — linkedin_connections.handle is the single source of truth. Do not write here.';
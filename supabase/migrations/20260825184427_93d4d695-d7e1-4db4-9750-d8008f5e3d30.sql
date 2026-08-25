CREATE OR REPLACE FUNCTION public.voice_corpus_review(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  published_at timestamp with time zone,
  created_at timestamp with time zone,
  excerpt text,
  hook_style text,
  counts_toward_voice boolean,
  source_label text,
  set_aside_reason text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  WITH reviewed AS (
    SELECT
      l.id,
      l.published_at,
      l.created_at,
      l.post_text AS excerpt,
      l.hook_style,
      l.source_type,
      l.authorship,
      l.acquisition,
      l.text_is_snippet,
      l.voice_corpus_status,
      -- Twin of voice_window(): this is the own-writing corpus predicate used for review labels.
      (
        l.post_text IS NOT NULL
        AND length(l.post_text) > 50
        AND COALESCE(l.authorship, 'unknown') <> 'aura_drafted'
        AND COALESCE(l.acquisition, 'unset') <> 'discovered'
        AND COALESCE(l.source_type, '') IN ('imported', 'linkedin_export', 'linkedin_own', 'manual_url', 'browser_capture')
        AND COALESCE(l.text_is_snippet, false) IS NOT TRUE
        AND COALESCE(l.voice_corpus_status, 'included') <> 'excluded'
      ) AS counts_toward_voice
    FROM public.linkedin_posts l
    WHERE l.user_id = p_user_id
      AND (auth.role() = 'service_role' OR auth.uid() = p_user_id)
      AND l.post_text IS NOT NULL
      AND trim(l.post_text) <> ''
  )
  SELECT
    r.id,
    r.published_at,
    r.created_at,
    r.excerpt,
    r.hook_style,
    r.counts_toward_voice,
    CASE
      WHEN r.source_type IN ('imported', 'linkedin_own') THEN 'Your post'
      WHEN r.source_type = 'linkedin_export' THEN 'From your LinkedIn export'
      WHEN r.source_type = 'aura_generated' THEN 'Written by Aura'
      WHEN r.source_type = 'search_discovery' THEN 'Found online'
      WHEN r.source_type IN ('manual_url', 'browser_capture') THEN 'Added by you'
      WHEN r.source_type = 'carousel_studio' THEN 'Written by Aura'
      ELSE 'Unknown source'
    END AS source_label,
    CASE
      WHEN r.counts_toward_voice THEN NULL
      WHEN COALESCE(r.voice_corpus_status, 'included') = 'excluded' THEN 'You set this aside'
      WHEN COALESCE(r.authorship, 'unknown') = 'aura_drafted' OR r.source_type IN ('aura_generated', 'carousel_studio') THEN 'Aura wrote this'
      WHEN COALESCE(r.text_is_snippet, false) IS TRUE THEN 'Only a fragment of text'
      WHEN COALESCE(r.acquisition, 'unset') = 'discovered' OR r.source_type = 'search_discovery' THEN 'Not written by you'
      WHEN length(COALESCE(r.excerpt, '')) <= 50 THEN 'Too short to read'
      ELSE NULL
    END AS set_aside_reason
  FROM reviewed r
  ORDER BY COALESCE(r.published_at, r.created_at) DESC NULLS LAST, r.created_at DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.voice_corpus_review(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voice_corpus_review(uuid) TO authenticated, service_role;
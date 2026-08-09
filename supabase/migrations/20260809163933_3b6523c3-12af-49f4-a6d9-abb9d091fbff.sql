-- Evidence coverage + freshness, derived from the same own-writing rule that
-- voice_window() uses, but across the whole corpus (coverage is not a window).
CREATE OR REPLACE FUNCTION public.voice_corpus_stats(p_user_id uuid)
RETURNS TABLE (post_count integer, newest_published_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int,
         max(COALESCE(l.published_at, l.created_at))
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') NOT IN ('search_discovery','aura_generated');
$$;

REVOKE EXECUTE ON FUNCTION public.voice_corpus_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voice_corpus_stats(uuid) TO authenticated, service_role;
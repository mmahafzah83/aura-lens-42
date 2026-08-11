CREATE OR REPLACE FUNCTION public.voice_corpus_stats(p_user_id uuid)
 RETURNS TABLE(post_count integer, newest_published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT count(*)::int,
         max(COALESCE(l.published_at, l.created_at))
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') <> 'search_discovery'
    AND COALESCE(l.source_type,'') <> 'aura_generated';
$function$;

CREATE OR REPLACE FUNCTION public.voice_window(p_user_id uuid)
 RETURNS TABLE(id uuid, post_text text, hook_style text, ending_type text, published_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT l.id, l.post_text, l.hook_style, l.ending_type, l.published_at, l.created_at
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') <> 'search_discovery'
    AND COALESCE(l.source_type,'') <> 'aura_generated'
    AND COALESCE(l.voice_corpus_status,'included') <> 'excluded'
  ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC
  LIMIT 12;
$function$;
CREATE OR REPLACE FUNCTION public.voice_opener_diversity(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_entropy numeric := 0;
  r record;
  v_p numeric;
BEGIN
  WITH recent AS (
    SELECT hook_style
    FROM public.linkedin_posts
    WHERE user_id = p_user_id
      AND post_text IS NOT NULL
      AND length(post_text) > 50
      AND COALESCE(authorship,'unknown') <> 'aura_drafted'
      AND COALESCE(acquisition,'unset') <> 'discovered'
      AND COALESCE(source_type,'') NOT IN ('search_discovery','aura_generated')
    ORDER BY published_at DESC NULLS LAST, created_at DESC
    LIMIT 20
  )
  SELECT count(*) INTO v_total FROM recent WHERE hook_style IS NOT NULL AND hook_style <> 'other';

  IF v_total < 12 THEN RETURN NULL; END IF;

  FOR r IN
    WITH recent AS (
      SELECT hook_style
      FROM public.linkedin_posts
      WHERE user_id = p_user_id
        AND post_text IS NOT NULL
        AND length(post_text) > 50
        AND COALESCE(authorship,'unknown') <> 'aura_drafted'
        AND COALESCE(acquisition,'unset') <> 'discovered'
        AND COALESCE(source_type,'') NOT IN ('search_discovery','aura_generated')
      ORDER BY published_at DESC NULLS LAST, created_at DESC
      LIMIT 20
    )
    SELECT hook_style, count(*)::numeric AS n
    FROM recent
    WHERE hook_style IS NOT NULL AND hook_style <> 'other'
    GROUP BY hook_style
  LOOP
    v_p := r.n / v_total;
    v_entropy := v_entropy - (v_p * ln(v_p));
  END LOOP;

  RETURN round((v_entropy / ln(6::numeric)) * 100, 1);
END;
$function$;
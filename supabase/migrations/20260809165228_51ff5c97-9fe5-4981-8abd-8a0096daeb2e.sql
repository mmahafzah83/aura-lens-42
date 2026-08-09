CREATE OR REPLACE FUNCTION public.voice_top_style_share(p_user_id uuid)
RETURNS TABLE(share numeric, top_style text, top_count integer, window_total integer, other_dominant boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_top_real_style text;
  v_top_real_count int;
  v_max_any int;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.voice_window(p_user_id) w
  WHERE w.hook_style IS NOT NULL;

  IF v_total < 8 THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text, NULL::int, v_total, NULL::boolean;
    RETURN;
  END IF;

  SELECT COALESCE(max(c), 0) INTO v_max_any
  FROM (
    SELECT count(*)::int AS c
    FROM public.voice_window(p_user_id) w
    WHERE w.hook_style IS NOT NULL
    GROUP BY w.hook_style
  ) a;

  SELECT s, c INTO v_top_real_style, v_top_real_count
  FROM (
    SELECT w.hook_style AS s, count(*)::int AS c
    FROM public.voice_window(p_user_id) w
    WHERE w.hook_style IS NOT NULL AND w.hook_style <> 'other'
    GROUP BY w.hook_style
    ORDER BY count(*) DESC, w.hook_style
    LIMIT 1
  ) b;

  IF v_top_real_style IS NULL THEN
    RETURN QUERY SELECT NULL::numeric, NULL::text, NULL::int, v_total, true;
    RETURN;
  END IF;

  RETURN QUERY SELECT round((v_top_real_count::numeric / v_total) * 100, 1),
                      v_top_real_style,
                      v_top_real_count,
                      v_total,
                      (v_max_any > v_top_real_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.voice_top_style_share(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.voice_profile_readiness(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_posts int;
  v_low int;
  v_computable int;
  v_diversity numeric;
  v_share numeric;
BEGIN
  SELECT user_id INTO v_user FROM public.authority_voice_profiles WHERE id = p_profile_id;
  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_posts
  FROM public.linkedin_posts
  WHERE user_id = v_user
    AND post_text IS NOT NULL
    AND length(post_text) > 50
    AND COALESCE(authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(acquisition,'unset') <> 'discovered'
    AND COALESCE(source_type,'') NOT IN ('search_discovery','aura_generated');

  SELECT count(*) INTO v_low
  FROM public.voice_traits t
  JOIN public.voice_trait_registry r ON r.trait_key = t.trait_key
  WHERE t.profile_id = p_profile_id AND r.computable AND t.confidence = 'low';

  SELECT count(*) INTO v_computable FROM public.voice_trait_registry WHERE computable AND active;

  IF v_posts < 8 THEN RETURN 'forming'; END IF;
  IF v_posts < 20 THEN RETURN 'developing'; END IF;
  IF v_posts < 30 OR v_low > 0 OR v_computable = 0 THEN RETURN 'working'; END IF;

  v_diversity := public.voice_opener_diversity(v_user);
  SELECT t.share INTO v_share FROM public.voice_top_style_share(v_user) t;

  IF v_diversity IS NOT NULL AND v_diversity >= 60
     AND v_share IS NOT NULL AND v_share <= 35 THEN
    RETURN 'distinctive';
  END IF;
  RETURN 'reliable';
END;
$function$;

UPDATE public.authority_voice_profiles p
SET readiness = public.voice_profile_readiness(p.id),
    updated_at = now()
WHERE public.voice_profile_readiness(p.id) IS DISTINCT FROM p.readiness;
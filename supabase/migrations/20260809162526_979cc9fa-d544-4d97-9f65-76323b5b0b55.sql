ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_hook_style_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_hook_style_vocab
  CHECK (hook_style IS NULL OR hook_style = ANY (ARRAY['contrarian_claim','number_first','short_story','question','experience_led','announcement','other']));

ALTER TABLE public.linkedin_posts DROP CONSTRAINT IF EXISTS linkedin_posts_ending_type_vocab;
ALTER TABLE public.linkedin_posts ADD CONSTRAINT linkedin_posts_ending_type_vocab
  CHECK (ending_type IS NULL OR ending_type = ANY (ARRAY['question','suspended','reframe','equation','number','cta','other']));

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
  CREATE TEMP TABLE IF NOT EXISTS _vod_noop() ON COMMIT DROP;

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

  -- Below 12 classified openers there is not enough evidence to score diversity.
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

  -- Normalised against the six real opener styles (the vocabulary minus 'other').
  RETURN round((v_entropy / ln(6::numeric)) * 100, 1);
END;
$function$;

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
  IF v_diversity IS NOT NULL AND v_diversity >= 60 THEN RETURN 'distinctive'; END IF;
  RETURN 'reliable';
END;
$function$;
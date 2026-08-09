-- ============================================================
-- THE CANONICAL VOICE WINDOW
-- The member's most recent 12 own-writing published posts.
-- Every consumer of "recent" must go through voice_window().
-- ============================================================
CREATE OR REPLACE FUNCTION public.voice_window(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  post_text text,
  hook_style text,
  ending_type text,
  published_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT l.id, l.post_text, l.hook_style, l.ending_type, l.published_at, l.created_at
  FROM public.linkedin_posts l
  WHERE l.user_id = p_user_id
    AND l.post_text IS NOT NULL
    AND length(l.post_text) > 50
    AND COALESCE(l.authorship,'unknown') <> 'aura_drafted'
    AND COALESCE(l.acquisition,'unset') <> 'discovered'
    AND COALESCE(l.source_type,'') NOT IN ('search_discovery','aura_generated')
  ORDER BY l.published_at DESC NULLS LAST, l.created_at DESC
  LIMIT 12;
$$;

GRANT EXECUTE ON FUNCTION public.voice_window(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Diversity: normalised Shannon entropy over the canonical
-- window. 'other' is a category like any other. Fewer than 8
-- classified posts in the window => NULL (never a fake zero).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.voice_opener_diversity(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_total int;
  v_entropy numeric := 0;
  r record;
  v_p numeric;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.voice_window(p_user_id) w
  WHERE w.hook_style IS NOT NULL;

  IF v_total < 8 THEN RETURN NULL; END IF;

  FOR r IN
    SELECT w.hook_style, count(*)::numeric AS n
    FROM public.voice_window(p_user_id) w
    WHERE w.hook_style IS NOT NULL
    GROUP BY w.hook_style
  LOOP
    v_p := r.n / v_total;
    v_entropy := v_entropy - (v_p * ln(v_p));
  END LOOP;

  -- 7 categories in the vocabulary, 'other' included.
  RETURN round((v_entropy / ln(7::numeric)) * 100, 1);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.voice_opener_diversity(uuid) TO authenticated, service_role;
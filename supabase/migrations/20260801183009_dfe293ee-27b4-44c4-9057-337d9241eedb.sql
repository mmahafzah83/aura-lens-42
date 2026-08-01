CREATE OR REPLACE FUNCTION public.home_record_timeline(p_uid uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(p_uid, auth.uid());
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH ev AS (
    SELECT created_at::date AS d, 'cap'::text AS k FROM public.entries WHERE user_id = v_uid
    UNION ALL
    SELECT created_at::date, 'theme' FROM public.strategic_signals WHERE user_id = v_uid
    UNION ALL
    SELECT created_at::date, 'draft' FROM public.linkedin_posts
      WHERE user_id = v_uid AND tracking_status = 'draft'
    UNION ALL
    SELECT COALESCE(published_at, created_at)::date, 'pub' FROM public.linkedin_posts
      WHERE user_id = v_uid AND tracking_status IN ('published','posted','live')
    UNION ALL
    SELECT created_at::date, 'night' FROM public.agent_findings WHERE user_id = v_uid
  ),
  agg AS (
    SELECT d,
      COUNT(*) FILTER (WHERE k = 'cap')::int   AS cap,
      COUNT(*) FILTER (WHERE k = 'theme')::int AS themes,
      COUNT(*) FILTER (WHERE k = 'draft')::int AS drafts,
      COUNT(*) FILTER (WHERE k = 'pub')::int   AS pub,
      COUNT(*) FILTER (WHERE k = 'night')::int AS nights
    FROM ev GROUP BY d
  ),
  days AS (
    SELECT jsonb_agg(jsonb_build_object(
      'd', d, 'cap', cap, 'themes', themes, 'drafts', drafts, 'pub', pub, 'nights', nights
    ) ORDER BY d DESC) AS j
    FROM agg WHERE d >= (CURRENT_DATE - 45)
  ),
  weeks AS (
    SELECT jsonb_agg(x ORDER BY (x->>'d') DESC) AS j FROM (
      SELECT jsonb_build_object(
        'd', date_trunc('week', d)::date,
        'cap', SUM(cap)::int, 'themes', SUM(themes)::int,
        'drafts', SUM(drafts)::int, 'pub', SUM(pub)::int, 'nights', SUM(nights)::int
      ) AS x
      FROM agg GROUP BY date_trunc('week', d)
    ) w
  ),
  months AS (
    SELECT jsonb_agg(x ORDER BY (x->>'d') DESC) AS j FROM (
      SELECT jsonb_build_object(
        'd', date_trunc('month', d)::date,
        'cap', SUM(cap)::int, 'themes', SUM(themes)::int,
        'drafts', SUM(drafts)::int, 'pub', SUM(pub)::int, 'nights', SUM(nights)::int
      ) AS x
      FROM agg GROUP BY date_trunc('month', d)
    ) m
  ),
  pubs AS (
    SELECT jsonb_agg(jsonb_build_object(
      'id', id,
      'at', COALESCE(published_at, created_at),
      'title', NULLIF(TRIM(COALESCE(NULLIF(TRIM(title), ''), NULLIF(TRIM(hook), ''), LEFT(COALESCE(post_text,''), 300))), ''),
      'through_aura', (source_signal_id IS NOT NULL
        OR (source_metadata IS NOT NULL AND jsonb_exists(source_metadata, 'signal_ids')))
    ) ORDER BY COALESCE(published_at, created_at) DESC) AS j
    FROM public.linkedin_posts
    WHERE user_id = v_uid AND tracking_status IN ('published','posted','live')
  ),
  snaps AS (
    SELECT tier, created_at,
           LAG(tier) OVER (ORDER BY created_at) AS prev_tier
    FROM public.imprint_snapshots WHERE user_id = v_uid AND tier IS NOT NULL
  ),
  bands AS (
    SELECT jsonb_agg(jsonb_build_object(
      'at', created_at, 'kind', 'band', 'value', tier
    ) ORDER BY created_at) AS j
    FROM snaps WHERE prev_tier IS NOT NULL AND tier <> prev_tier
  ),
  first_pub AS (
    SELECT jsonb_build_object(
      'at', COALESCE(published_at, created_at), 'kind', 'first_publish',
      'value', NULLIF(TRIM(COALESCE(NULLIF(TRIM(title), ''), NULLIF(TRIM(hook), ''), LEFT(COALESCE(post_text,''), 300))), '')
    ) AS j
    FROM public.linkedin_posts
    WHERE user_id = v_uid AND tracking_status IN ('published','posted','live')
    ORDER BY COALESCE(published_at, created_at) ASC LIMIT 1
  ),
  sig_frag AS (
    SELECT s.id, s.signal_title, f.created_at,
           ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY f.created_at) AS rn
    FROM public.strategic_signals s
    CROSS JOIN LATERAL unnest(COALESCE(s.supporting_evidence_ids, ARRAY[]::uuid[])) AS ev_id
    JOIN public.evidence_fragments f ON f.id = ev_id
    WHERE s.user_id = v_uid
  ),
  thresholds AS (
    SELECT 25 AS n UNION ALL SELECT 50
  ),
  frag_marks AS (
    SELECT jsonb_agg(x ORDER BY (x->>'at')) AS j FROM (
      SELECT DISTINCT ON (t.n) jsonb_build_object(
        'at', sf.created_at, 'kind', 'fragments', 'value', sf.signal_title, 'n', t.n
      ) AS x
      FROM thresholds t
      JOIN sig_frag sf ON sf.rn = t.n
      ORDER BY t.n, sf.created_at ASC
    ) q
  ),
  profile AS (
    SELECT created_at FROM public.diagnostic_profiles WHERE user_id = v_uid LIMIT 1
  )
  SELECT jsonb_build_object(
    'days',   COALESCE((SELECT j FROM days), '[]'::jsonb),
    'weeks',  COALESCE((SELECT j FROM weeks), '[]'::jsonb),
    'months', COALESCE((SELECT j FROM months), '[]'::jsonb),
    'published', COALESCE((SELECT j FROM pubs), '[]'::jsonb),
    'milestones',
      COALESCE((SELECT j FROM bands), '[]'::jsonb)
      || COALESCE((SELECT jsonb_build_array(j) FROM first_pub), '[]'::jsonb)
      || COALESCE((SELECT j FROM frag_marks), '[]'::jsonb),
    'signup_at', (SELECT created_at FROM profile),
    'published_total', (SELECT COUNT(*) FROM public.linkedin_posts
      WHERE user_id = v_uid AND tracking_status IN ('published','posted','live')),
    'published_through_aura', (SELECT COUNT(*) FROM public.linkedin_posts
      WHERE user_id = v_uid AND tracking_status IN ('published','posted','live')
        AND (source_signal_id IS NOT NULL
             OR (source_metadata IS NOT NULL AND jsonb_exists(source_metadata, 'signal_ids')))),
    'fragments_total', (SELECT COUNT(*) FROM public.evidence_fragments WHERE user_id = v_uid),
    'themes_total', (SELECT COUNT(*) FROM public.strategic_signals WHERE user_id = v_uid)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.home_record_timeline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_record_timeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.home_record_timeline(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.home_record_themes(p_from date, p_to date, p_uid uuid DEFAULT NULL)
RETURNS TABLE(id uuid, title text, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.signal_title, s.created_at
  FROM public.strategic_signals s
  WHERE s.user_id = COALESCE(p_uid, auth.uid())
    AND (COALESCE(p_uid, auth.uid()) = auth.uid() OR public.is_current_user_admin())
    AND s.created_at::date >= p_from
    AND s.created_at::date <= p_to
  ORDER BY s.created_at DESC
  LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.home_record_themes(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_record_themes(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.home_record_themes(date, date, uuid) TO service_role;
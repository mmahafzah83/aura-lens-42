CREATE OR REPLACE VIEW public.post_provenance
WITH (security_invoker = true) AS
SELECT
  p.*,
  CASE
    WHEN p.publish_attempted_at IS NOT NULL THEN 'aura_published'
    WHEN p.source_metadata IS NOT NULL AND jsonb_exists(p.source_metadata, 'source') THEN 'aura_drafted'
    ELSE 'linkedin_only'
  END AS provenance
FROM public.linkedin_posts p
WHERE p.published_at IS NOT NULL;

GRANT SELECT ON public.post_provenance TO authenticated;
GRANT SELECT ON public.post_provenance TO service_role;

CREATE OR REPLACE FUNCTION public.home_record_timeline(p_uid uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_uid, auth.uid());
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH pp AS (
    SELECT * FROM public.post_provenance WHERE user_id = v_uid
  ),
  ev AS (
    SELECT created_at::date AS d, 'cap'::text AS k FROM public.entries WHERE user_id = v_uid
    UNION ALL
    SELECT created_at::date, 'theme' FROM public.strategic_signals WHERE user_id = v_uid
    UNION ALL
    SELECT created_at::date, 'draft' FROM public.linkedin_posts
      WHERE user_id = v_uid AND tracking_status = 'draft'
    UNION ALL
    SELECT COALESCE(published_at, created_at)::date, 'pub' FROM pp
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
      'provenance', provenance,
      'through_aura', (provenance IN ('aura_published','aura_drafted'))
    ) ORDER BY COALESCE(published_at, created_at) DESC) AS j
    FROM pp
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
    FROM pp
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
    'published_total', (SELECT COUNT(*) FROM pp),
    'published_through_aura', (SELECT COUNT(*) FROM pp WHERE provenance IN ('aura_published','aura_drafted')),
    'published_sent_from_aura', (SELECT COUNT(*) FROM pp WHERE provenance = 'aura_published'),
    'fragments_total', (SELECT COUNT(*) FROM public.evidence_fragments WHERE user_id = v_uid),
    'themes_total', (SELECT COUNT(*) FROM public.strategic_signals WHERE user_id = v_uid)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS public.momentum_funnel();
CREATE FUNCTION public.momentum_funnel()
 RETURNS TABLE(captures integer, used_in_signal integer, signals integer, published integer, published_through_aura integer, published_live integer, published_sent_from_aura integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pp AS (
    SELECT provenance FROM public.post_provenance WHERE user_id = auth.uid()
  ),
  aura AS (SELECT count(*)::int AS n FROM pp WHERE provenance IN ('aura_published','aura_drafted')),
  sent AS (SELECT count(*)::int AS n FROM pp WHERE provenance = 'aura_published'),
  live AS (SELECT count(*)::int AS n FROM pp)
  SELECT
    (SELECT count(*)::int FROM public.entries e WHERE e.user_id = auth.uid()),
    (SELECT count(DISTINCT e.id)::int FROM public.entries e
      WHERE e.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.source_registry sr
          JOIN public.evidence_fragments ef ON ef.source_registry_id = sr.id
          JOIN public.strategic_signals s ON ef.id = ANY(s.supporting_evidence_ids)
          WHERE sr.source_id = e.id AND s.user_id = auth.uid()
        )),
    (SELECT count(*)::int FROM public.strategic_signals s WHERE s.user_id = auth.uid()),
    (SELECT n FROM aura),
    (SELECT n FROM aura),
    (SELECT n FROM live),
    (SELECT n FROM sent)
$function$;

GRANT EXECUTE ON FUNCTION public.momentum_funnel() TO authenticated;
GRANT EXECUTE ON FUNCTION public.momentum_funnel() TO service_role;
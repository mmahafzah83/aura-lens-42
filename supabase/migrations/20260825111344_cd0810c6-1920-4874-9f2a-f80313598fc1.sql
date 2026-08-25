DROP FUNCTION IF EXISTS public.home_record_timeline(uuid);

CREATE OR REPLACE FUNCTION public.home_record_themes(p_from date, p_to date, p_uid uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'UTC'::text)
 RETURNS TABLE(id uuid, title text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.signal_title, s.created_at
  FROM public.strategic_signals s
  WHERE s.user_id = COALESCE(p_uid, auth.uid())
    AND (COALESCE(p_uid, auth.uid()) = auth.uid() OR public.is_current_user_admin())
    AND s.status IN ('active','dormant')
    AND (s.created_at AT TIME ZONE p_tz)::date >= p_from
    AND (s.created_at AT TIME ZONE p_tz)::date <= p_to
  ORDER BY s.created_at DESC
  LIMIT 10;
$function$;

CREATE OR REPLACE FUNCTION public.home_record_timeline(p_uid uuid DEFAULT NULL::uuid, p_tz text DEFAULT 'UTC'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(p_uid, auth.uid());
  v_tz  text := COALESCE(NULLIF(p_tz,''), 'UTC');
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF v_uid <> auth.uid() AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  PERFORM set_config('timezone', v_tz, true);

  WITH pp AS (SELECT * FROM public.post_provenance WHERE user_id = v_uid),
  ev AS (
    SELECT (created_at AT TIME ZONE v_tz)::date AS d, 'cap'::text AS k FROM public.entries WHERE user_id = v_uid
    UNION ALL
    SELECT (created_at AT TIME ZONE v_tz)::date, 'theme' FROM public.strategic_signals
      WHERE user_id = v_uid AND status IN ('active','dormant')
    UNION ALL
    SELECT (at AT TIME ZONE v_tz)::date, 'draft' FROM public.post_events
      WHERE user_id = v_uid AND event = 'drafted' AND actor = 'aura'
    UNION ALL
    SELECT (at AT TIME ZONE v_tz)::date, 'pub' FROM public.post_events
      WHERE user_id = v_uid AND event = 'published'
    UNION ALL
    SELECT (created_at AT TIME ZONE v_tz)::date, 'night' FROM public.agent_findings WHERE user_id = v_uid
  ),
  agg AS (
    SELECT d,
      COUNT(*) FILTER (WHERE k='cap')::int cap, COUNT(*) FILTER (WHERE k='theme')::int themes,
      COUNT(*) FILTER (WHERE k='draft')::int drafts, COUNT(*) FILTER (WHERE k='pub')::int pub,
      COUNT(*) FILTER (WHERE k='night')::int nights
    FROM ev GROUP BY d
  ),
  span AS (SELECT COALESCE(MIN(d), CURRENT_DATE) lo, CURRENT_DATE hi FROM agg),
  mser AS (
    SELECT generate_series(date_trunc('month',(SELECT lo FROM span)), date_trunc('month',(SELECT hi FROM span)), '1 month')::date AS m
  ),
  days AS (
    SELECT jsonb_agg(jsonb_build_object('d',d,'cap',cap,'themes',themes,'drafts',drafts,'pub',pub,'nights',nights) ORDER BY d DESC) j
    FROM agg WHERE d >= (CURRENT_DATE - 45)
  ),
  weeks AS (
    SELECT jsonb_agg(x ORDER BY (x->>'d') DESC) j FROM (
      SELECT jsonb_build_object('d',date_trunc('week',d)::date,'cap',SUM(cap)::int,'themes',SUM(themes)::int,
        'drafts',SUM(drafts)::int,'pub',SUM(pub)::int,'nights',SUM(nights)::int) x
      FROM agg WHERE d >= (CURRENT_DATE - 400) GROUP BY date_trunc('week',d)) w
  ),
  months AS (
    SELECT jsonb_agg(x ORDER BY (x->>'d') DESC) j FROM (
      SELECT jsonb_build_object('d',mser.m,'cap',COALESCE(SUM(a.cap),0)::int,'themes',COALESCE(SUM(a.themes),0)::int,
        'drafts',COALESCE(SUM(a.drafts),0)::int,'pub',COALESCE(SUM(a.pub),0)::int,'nights',COALESCE(SUM(a.nights),0)::int) x
      FROM mser LEFT JOIN agg a ON date_trunc('month',a.d)::date = mser.m
      GROUP BY mser.m) m
  ),
  pubs AS (
    SELECT jsonb_agg(jsonb_build_object('id',id,'at',COALESCE(published_at,created_at),
      'title',NULLIF(TRIM(COALESCE(NULLIF(TRIM(title),''),NULLIF(TRIM(hook),''),LEFT(COALESCE(post_text,''),160))),''),
      'provenance',provenance,'through_aura',(provenance IN ('aura_published','aura_drafted'))) ORDER BY COALESCE(published_at,created_at) DESC) j
    FROM (SELECT * FROM pp ORDER BY COALESCE(published_at,created_at) DESC LIMIT 200) q
  ),
  snaps AS (SELECT tier, created_at, LAG(tier) OVER (ORDER BY created_at) prev_tier
            FROM public.imprint_snapshots WHERE user_id=v_uid AND tier IS NOT NULL),
  bands AS (
    SELECT jsonb_agg(jsonb_build_object('at',created_at,'kind','band','value',tier,
      'direction', CASE WHEN public.tier_rank(tier) > public.tier_rank(prev_tier) THEN 'up' ELSE 'down' END) ORDER BY created_at) j
    FROM snaps WHERE prev_tier IS NOT NULL AND tier <> prev_tier
  ),
  first_pub AS (
    SELECT jsonb_build_object('at',COALESCE(published_at,created_at),'kind','first_publish',
      'value',NULLIF(TRIM(COALESCE(NULLIF(TRIM(title),''),NULLIF(TRIM(hook),''),LEFT(COALESCE(post_text,''),160))),''),
      'through_aura',(provenance IN ('aura_published','aura_drafted'))) j
    FROM pp WHERE provenance IN ('aura_published','aura_drafted')
    ORDER BY COALESCE(published_at,created_at) ASC LIMIT 1
  ),
  sig_frag AS (
    SELECT s.id, s.signal_title, f.created_at,
           ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY f.created_at) rn
    FROM public.strategic_signals s
    CROSS JOIN LATERAL unnest(COALESCE(s.supporting_evidence_ids, ARRAY[]::uuid[])) ev_id
    JOIN public.evidence_fragments f ON f.id = ev_id
    WHERE s.user_id = v_uid AND COALESCE(s.fragment_count,0) >= 25
  ),
  frag_marks AS (
    SELECT jsonb_agg(x ORDER BY (x->>'at')) j FROM (
      SELECT DISTINCT ON (t.n) jsonb_build_object('at',sf.created_at,'kind','fragments','value',sf.signal_title,'n',t.n) x
      FROM (SELECT 25 n UNION ALL SELECT 50) t JOIN sig_frag sf ON sf.rn = t.n
      ORDER BY t.n, sf.created_at ASC) q
  ),
  profile AS (SELECT created_at FROM public.diagnostic_profiles WHERE user_id=v_uid LIMIT 1)
  SELECT jsonb_build_object(
    'days',COALESCE((SELECT j FROM days),'[]'::jsonb),
    'weeks',COALESCE((SELECT j FROM weeks),'[]'::jsonb),
    'months',COALESCE((SELECT j FROM months),'[]'::jsonb),
    'published',COALESCE((SELECT j FROM pubs),'[]'::jsonb),
    'milestones',COALESCE((SELECT j FROM bands),'[]'::jsonb)
      || COALESCE((SELECT jsonb_build_array(j) FROM first_pub),'[]'::jsonb)
      || COALESCE((SELECT j FROM frag_marks),'[]'::jsonb),
    'signup_at',(SELECT created_at FROM profile),
    'tz', v_tz,
    'published_total',(SELECT COUNT(*) FROM pp),
    'published_returned',(SELECT COUNT(*) FROM (SELECT 1 FROM pp LIMIT 200) z),
    'published_through_aura',(SELECT COUNT(*) FROM pp WHERE provenance IN ('aura_published','aura_drafted')),
    'published_sent_from_aura',(SELECT COUNT(*) FROM pp WHERE provenance='aura_published'),
    'fragments_total',(SELECT COUNT(*) FROM public.evidence_fragments WHERE user_id=v_uid),
    'themes_total',(SELECT COUNT(*) FROM public.strategic_signals WHERE user_id=v_uid AND status IN ('active','dormant'))
  ) INTO v_result;
  RETURN v_result;
END; $function$;

REVOKE ALL ON FUNCTION public.home_record_timeline(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_record_timeline(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.home_record_themes(date, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_record_themes(date, date, uuid, text) TO authenticated, service_role;
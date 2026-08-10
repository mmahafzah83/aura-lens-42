-- 1. Named exclusion helper replaces founder_uuid()
CREATE OR REPLACE FUNCTION public.excluded_user_ids()
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id FROM public.diagnostic_profiles p WHERE p.is_internal;
$$;
REVOKE ALL ON FUNCTION public.excluded_user_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.excluded_user_ids() TO authenticated, service_role;

-- 2. cockpit_pulse: all three per-member subqueries respect is_internal
CREATE OR REPLACE VIEW public.cockpit_pulse AS
 SELECT now() AS as_of,
    (SELECT count(*) FROM cockpit_members) AS members,
    (SELECT count(*) FILTER (WHERE cockpit_members.active_7d) FROM cockpit_members) AS active_7d,
    (SELECT count(*) FILTER (WHERE cockpit_members.state = 'shipping') FROM cockpit_members) AS shipping,
    (SELECT count(*) FILTER (WHERE cockpit_members.state = 'started') FROM cockpit_members) AS started,
    (SELECT count(*) FILTER (WHERE cockpit_members.state = 'drawer') FROM cockpit_members) AS drawer,
    (SELECT count(*) FILTER (WHERE cockpit_members.state = 'cold') FROM cockpit_members) AS cold,
    (SELECT COALESCE(sum(cockpit_members.captures), 0::numeric) FROM cockpit_members) AS captures_total,
    (SELECT count(*) FROM entries
       WHERE entries.user_id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
         AND entries.created_at > (now() - interval '7 days')) AS captures_7d,
    (SELECT count(*) FROM linkedin_posts
       WHERE linkedin_posts.user_id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)) AS posts_total,
    (SELECT COALESCE(sum(cockpit_members.posts_through_aura), 0::numeric) FROM cockpit_members) AS posts_through_aura,
    (SELECT count(*) FROM lifecycle_email_log
       WHERE lifecycle_email_log.user_id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
         AND lifecycle_email_log.sent_at > (now() - interval '7 days')) AS emails_7d,
    (SELECT count(*) FROM ef_faults WHERE ef_faults.created_at > (now() - interval '48 hours')) AS faults_48h,
    (SELECT count(*) FROM health_findings WHERE health_findings.resolved_at IS NULL) AS health_open;

-- 3. Remove the last hardcoded identity literals from admin/brief functions
CREATE OR REPLACE FUNCTION public.admin_economics_denominators()
 RETURNS TABLE(active_users integer, published_posts integer, signals_delivered integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH real_users AS (
    SELECT u.id FROM auth.users u
    WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
      AND coalesce(u.email, '') NOT ILIKE '%test%'
      AND coalesce(u.email, '') NOT ILIKE '%@example.com'
  )
  SELECT
    (SELECT count(DISTINCT l.user_id)::integer FROM public.ai_usage_log l
      WHERE l.created_at >= date_trunc('month', now()) AND l.user_id IS NOT NULL),
    (SELECT count(*)::integer FROM public.linkedin_posts p
      WHERE p.tracking_status = 'published'
        AND p.created_at >= date_trunc('month', now())
        AND p.user_id IN (SELECT id FROM real_users)),
    (SELECT count(*)::integer FROM public.strategic_signals s
      WHERE s.created_at >= date_trunc('month', now())
        AND s.user_id IN (SELECT id FROM real_users))
  WHERE public.is_current_user_admin()
$function$
;
CREATE OR REPLACE FUNCTION public.founder_brief_user_ids()
 RETURNS TABLE(user_id uuid, email text, last_sign_in_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT u.id, u.email::text, u.last_sign_in_at, u.created_at
  FROM auth.users u
  WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
    AND coalesce(u.email, '') NOT ILIKE '%test%'
$function$
;
CREATE OR REPLACE FUNCTION public.founder_brief_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'cron'
AS $function$
DECLARE
  excluded uuid[] := ARRAY(SELECT e.user_id FROM public.excluded_user_ids() e);
  ru uuid[];
  out jsonb;
BEGIN
  SELECT array_agg(id) INTO ru FROM auth.users u
   WHERE u.id <> ALL(excluded) AND coalesce(u.email,'') NOT ILIKE '%test%';
  ru := coalesce(ru, ARRAY[]::uuid[]);

  SELECT jsonb_build_object(
    'generated_at', now(),
    'excluded_test_users', (SELECT count(*) FROM auth.users WHERE coalesce(email,'') ILIKE '%test%'),
    'funnel', jsonb_build_object(
      'invited', cardinality(ru),
      'signed_in', (SELECT count(*) FROM auth.users WHERE id = ANY(ru) AND last_sign_in_at IS NOT NULL),
      'signed_in_xc', (SELECT count(DISTINCT user_id) FROM diagnostic_profiles WHERE user_id = ANY(ru)),
      'finished_setup', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru)),
      'captured', (SELECT count(DISTINCT user_id) FROM entries WHERE user_id = ANY(ru)),
      'captured_xc', (SELECT count(DISTINCT user_id) FROM captures WHERE user_id = ANY(ru)),
      'got_signal', (SELECT count(DISTINCT user_id) FROM strategic_signals WHERE user_id = ANY(ru)),
      'linkedin_live', (SELECT count(DISTINCT user_id) FROM linkedin_connections WHERE user_id = ANY(ru) AND status = 'active'),
      'linkedin_live_xc', (SELECT count(DISTINCT user_id) FROM linkedin_connections WHERE user_id = ANY(ru) AND access_token IS NOT NULL),
      'opened_writer', (SELECT count(DISTINCT user_id) FROM product_events WHERE user_id = ANY(ru) AND event = 'composer_opened'),
      'has_draft', (SELECT count(*) FROM (
          SELECT user_id FROM content_items WHERE user_id = ANY(ru) AND status = 'draft'
          UNION
          SELECT user_id FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status = 'draft'
            AND source_type IN ('aura_generated','carousel_studio')
        ) d),
      'published', (SELECT count(DISTINCT user_id) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status = 'published'),
      'published_xc', (SELECT count(DISTINCT user_id) FROM product_events WHERE user_id = ANY(ru) AND event = 'post_published')
    ),
    'drafts', jsonb_build_object(
      'content_items', (SELECT count(*) FROM content_items WHERE user_id = ANY(ru) AND status = 'draft'),
      'linkedin_posts', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status = 'draft' AND source_type IN ('aura_generated','carousel_studio')),
      'linkedin_posts_all_rows', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru)),
      'oldest_days', (SELECT floor(EXTRACT(epoch FROM now() - min(c))/86400)::int FROM (
          SELECT min(created_at) c FROM content_items WHERE user_id = ANY(ru) AND status='draft'
          UNION ALL
          SELECT min(created_at) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='draft' AND source_type IN ('aura_generated','carousel_studio')
        ) x),
      'list', coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY (l.age_days) DESC) FROM (
          SELECT ci.id::text AS id, 'content_items' AS source, ci.user_id::text AS user_id,
                 coalesce(dp.first_name, 'Someone') AS first_name,
                 coalesce(nullif(ci.title,''), left(coalesce(ci.body,''),60)) AS title,
                 floor(EXTRACT(epoch FROM now()-ci.created_at)/86400)::int AS age_days
            FROM content_items ci LEFT JOIN diagnostic_profiles dp ON dp.user_id = ci.user_id
           WHERE ci.user_id = ANY(ru) AND ci.status='draft'
          UNION ALL
          SELECT lp.id::text, 'linkedin_posts', lp.user_id::text,
                 coalesce(dp.first_name,'Someone'),
                 left(coalesce(nullif(lp.title,''), lp.post_text, lp.hook, ''),60),
                 floor(EXTRACT(epoch FROM now()-lp.created_at)/86400)::int
            FROM linkedin_posts lp LEFT JOIN diagnostic_profiles dp ON dp.user_id = lp.user_id
           WHERE lp.user_id = ANY(ru) AND lp.tracking_status='draft'
             AND lp.source_type IN ('aura_generated','carousel_studio')
        ) l), '[]'::jsonb)
    ),
    'content', jsonb_build_object(
      'published_total', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='published'),
      'published_30d', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='published' AND coalesce(published_at, created_at) > now()-interval '30 days'),
      'failed_total', (SELECT count(*) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='failed')
    ),
    'signals', jsonb_build_object(
      'live', (SELECT count(*) FROM strategic_signals WHERE user_id = ANY(ru) AND coalesce(status,'active')='active'),
      'created_7d', (SELECT count(*) FROM strategic_signals WHERE user_id = ANY(ru) AND created_at > now()-interval '7 days'),
      'stale_30d', (SELECT count(*) FROM strategic_signals WHERE user_id = ANY(ru) AND coalesce(status,'active')='active' AND created_at < now()-interval '30 days')
    ),
    'failed_publishes', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'first_name', coalesce(dp.first_name,'Someone'),
        'user_id', lp.user_id::text,
        'post_id', lp.id::text,
        'date', to_char(lp.created_at,'DD Mon'),
        'error', coalesce(lp.source_metadata->>'publish_error','no error recorded')
      ) ORDER BY lp.created_at DESC)
      FROM linkedin_posts lp LEFT JOIN diagnostic_profiles dp ON dp.user_id = lp.user_id
      WHERE lp.user_id = ANY(ru) AND lp.tracking_status = 'failed'), '[]'::jsonb),
    'signal_reads', jsonb_build_object(
      'engagements', (SELECT count(*) FROM signal_engagements WHERE user_id = ANY(ru)),
      'product_event_rows', (SELECT count(*) FROM product_events WHERE user_id = ANY(ru) AND event ILIKE '%signal%' AND (event ILIKE '%open%' OR event ILIKE '%view%')),
      'product_event_exists', (SELECT EXISTS(SELECT 1 FROM product_events WHERE event ILIKE '%signal%' AND (event ILIKE '%open%' OR event ILIKE '%view%')))
    ),
    'grid', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'd', to_char(g.day,'DD'),
        'captures', (SELECT count(*) FROM entries e WHERE e.user_id = ANY(ru) AND e.created_at::date = g.day),
        'signals', (SELECT count(*) FROM strategic_signals s WHERE s.user_id = ANY(ru) AND s.created_at::date = g.day),
        'composer', (SELECT count(*) FROM product_events p WHERE p.user_id = ANY(ru) AND p.event='composer_opened' AND p.occurred_at::date = g.day),
        'published', (SELECT count(*) FROM linkedin_posts l WHERE l.user_id = ANY(ru) AND l.tracking_status='published' AND coalesce(l.published_at, l.created_at)::date = g.day)
      ) ORDER BY g.day) FROM generate_series((now()::date - 13), now()::date, '1 day') g(day)), '[]'::jsonb),
    'people', coalesce((SELECT jsonb_agg(p ORDER BY p->>'first_name') FROM (
        SELECT jsonb_build_object(
          'user_id', u.id::text,
          'email', u.email,
          'first_name', coalesce(dp.first_name, split_part(u.email,'@',1)),
          'captures', (SELECT count(*) FROM entries e WHERE e.user_id = u.id),
          'signals', (SELECT count(*) FROM strategic_signals s WHERE s.user_id = u.id),
          'drafts', (SELECT count(*) FROM content_items ci WHERE ci.user_id=u.id AND ci.status='draft')
                    + (SELECT count(*) FROM linkedin_posts lp WHERE lp.user_id=u.id AND lp.tracking_status='draft' AND lp.source_type IN ('aura_generated','carousel_studio')),
          'linkedin', CASE
            WHEN EXISTS(SELECT 1 FROM linkedin_connections lc WHERE lc.user_id=u.id AND lc.status='active') THEN 'live'
            WHEN EXISTS(SELECT 1 FROM linkedin_connections lc WHERE lc.user_id=u.id) THEN 'dropped'
            ELSE 'never' END,
          'days_since_capture', (SELECT floor(EXTRACT(epoch FROM now()-max(e.created_at))/86400)::int FROM entries e WHERE e.user_id=u.id),
          'published', (SELECT count(*) FROM linkedin_posts lp WHERE lp.user_id=u.id AND lp.tracking_status='published'),
          'stages', jsonb_build_object(
            'signed_in', (u.last_sign_in_at IS NOT NULL),
            'finished_setup', EXISTS(SELECT 1 FROM diagnostic_profiles d2 WHERE d2.user_id=u.id),
            'captured', EXISTS(SELECT 1 FROM entries e2 WHERE e2.user_id=u.id),
            'got_signal', EXISTS(SELECT 1 FROM strategic_signals s2 WHERE s2.user_id=u.id),
            'linkedin_live', EXISTS(SELECT 1 FROM linkedin_connections l2 WHERE l2.user_id=u.id AND l2.status='active'),
            'opened_writer', EXISTS(SELECT 1 FROM product_events p2 WHERE p2.user_id=u.id AND p2.event='composer_opened'),
            'has_draft', (EXISTS(SELECT 1 FROM content_items c2 WHERE c2.user_id=u.id AND c2.status='draft')
                          OR EXISTS(SELECT 1 FROM linkedin_posts l3 WHERE l3.user_id=u.id AND l3.tracking_status='draft' AND l3.source_type IN ('aura_generated','carousel_studio'))),
            'published', EXISTS(SELECT 1 FROM linkedin_posts l4 WHERE l4.user_id=u.id AND l4.tracking_status='published')
          )
        ) AS p
        FROM auth.users u LEFT JOIN diagnostic_profiles dp ON dp.user_id = u.id
        WHERE u.id = ANY(ru)
      ) q), '[]'::jsonb)
  ) INTO out;

  RETURN out;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_cohorts()
 RETURNS TABLE(cohort_week date, size integer, captured integer, got_signal integer, linkedin_live integer, opened_writer integer, has_draft integer, published integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  RETURN QUERY
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
      AND coalesce(u.email, '') NOT ILIKE '%test%'
  )
  SELECT
    date_trunc('week', ru.created_at)::date,
    count(*)::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM entries e WHERE e.user_id = ru.id))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM strategic_signals s WHERE s.user_id = ru.id))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM linkedin_connections l WHERE l.user_id = ru.id AND l.status = 'active'))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM product_events p WHERE p.user_id = ru.id AND p.event = 'composer_opened'))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM content_items c WHERE c.user_id = ru.id AND c.status = 'draft')
                        OR EXISTS (SELECT 1 FROM linkedin_posts lp WHERE lp.user_id = ru.id AND lp.tracking_status = 'draft'
                                     AND lp.source_type IN ('aura_generated','carousel_studio')))::int,
    count(*) FILTER (WHERE EXISTS (SELECT 1 FROM linkedin_posts lp WHERE lp.user_id = ru.id AND lp.tracking_status = 'published'))::int
  FROM ru
  GROUP BY 1
  ORDER BY 1;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.admin_stage_timeline(p_days integer DEFAULT 90)
 RETURNS TABLE(day date, signed_up integer, finished_setup integer, captured integer, got_signal integer, linkedin_live integer, opened_writer integer, has_draft integer, published integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  RETURN QUERY
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id NOT IN (SELECT e.user_id FROM public.excluded_user_ids() e)
      AND coalesce(u.email, '') NOT ILIKE '%test%'
  ),
  reached AS (
    SELECT
      ru.created_at::date AS signed_up_on,
      (SELECT min(d.created_at)::date FROM diagnostic_profiles d WHERE d.user_id = ru.id) AS setup_on,
      (SELECT min(e.created_at)::date FROM entries e WHERE e.user_id = ru.id) AS captured_on,
      (SELECT min(s.created_at)::date FROM strategic_signals s WHERE s.user_id = ru.id) AS signal_on,
      (SELECT min(l.created_at)::date FROM linkedin_connections l WHERE l.user_id = ru.id AND l.status = 'active') AS linkedin_on,
      (SELECT min(p.occurred_at)::date FROM product_events p WHERE p.user_id = ru.id AND p.event = 'composer_opened') AS writer_on,
      LEAST(
        (SELECT min(c.created_at)::date FROM content_items c WHERE c.user_id = ru.id AND c.status = 'draft'),
        (SELECT min(lp.created_at)::date FROM linkedin_posts lp WHERE lp.user_id = ru.id AND lp.tracking_status = 'draft'
           AND lp.source_type IN ('aura_generated','carousel_studio'))
      ) AS draft_on,
      (SELECT min(coalesce(lp.published_at, lp.created_at))::date FROM linkedin_posts lp
        WHERE lp.user_id = ru.id AND lp.tracking_status = 'published') AS published_on
    FROM ru
  ),
  days AS (
    SELECT generate_series(now()::date - greatest(coalesce(p_days, 90), 1) + 1, now()::date, '1 day')::date AS d
  )
  SELECT
    days.d,
    count(*) FILTER (WHERE r.signed_up_on  <= days.d)::int,
    count(*) FILTER (WHERE r.setup_on      <= days.d)::int,
    count(*) FILTER (WHERE r.captured_on   <= days.d)::int,
    count(*) FILTER (WHERE r.signal_on     <= days.d)::int,
    count(*) FILTER (WHERE r.linkedin_on   <= days.d)::int,
    count(*) FILTER (WHERE r.writer_on     <= days.d)::int,
    count(*) FILTER (WHERE r.draft_on      <= days.d)::int,
    count(*) FILTER (WHERE r.published_on  <= days.d)::int
  FROM days CROSS JOIN reached r
  GROUP BY days.d
  ORDER BY days.d;
END;
$function$
;

-- 4. Retire the hardcoded founder function (zero remaining dependencies)
DROP FUNCTION public.founder_uuid();
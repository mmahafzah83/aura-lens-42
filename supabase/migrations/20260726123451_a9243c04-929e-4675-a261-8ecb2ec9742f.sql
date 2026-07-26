GRANT SELECT ON public.daily_brief_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.founder_brief_data()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'cron'
AS $function$
DECLARE
  founder uuid := '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3';
  ru uuid[];
  out jsonb;
BEGIN
  SELECT array_agg(id) INTO ru FROM auth.users u
   WHERE u.id <> founder AND coalesce(u.email,'') NOT ILIKE '%test%';
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
                 left(coalesce(lp.content,''),60),
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
        ) p
        FROM auth.users u LEFT JOIN diagnostic_profiles dp ON dp.user_id = u.id
        WHERE u.id = ANY(ru)
      ) q), '[]'::jsonb),
    'assets', jsonb_build_object(
      'total', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru)),
      'onboarding_completed', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru) AND onboarding_completed IS TRUE),
      'audit', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru) AND audit_completed_at IS NOT NULL),
      'brand', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru) AND brand_assessment_completed_at IS NOT NULL),
      'linkedin', (SELECT count(DISTINCT user_id) FROM linkedin_connections WHERE user_id = ANY(ru) AND status='active'),
      'report', (SELECT count(DISTINCT user_id) FROM report_snapshots WHERE user_id = ANY(ru)),
      'avatar', (SELECT count(*) FROM diagnostic_profiles WHERE user_id = ANY(ru) AND coalesce(avatar_url,'') <> ''),
      'published', (SELECT count(DISTINCT user_id) FROM linkedin_posts WHERE user_id = ANY(ru) AND tracking_status='published')
    ),
    'voc', jsonb_build_object(
      'feedback', coalesce((SELECT jsonb_agg(jsonb_build_object('rating',bf.rating,'message',bf.message,'date',to_char(bf.created_at,'DD Mon'),
                              'first_name', coalesce(dp.first_name,'Someone'),'user_id',bf.user_id::text) ORDER BY bf.created_at DESC)
                            FROM beta_feedback bf LEFT JOIN diagnostic_profiles dp ON dp.user_id=bf.user_id
                            WHERE bf.user_id = ANY(ru) AND bf.created_at > now()-interval '30 days'), '[]'::jsonb),
      'guide_misses', coalesce((SELECT jsonb_agg(jsonb_build_object('slug',slug,'count',count) ORDER BY count DESC)
                            FROM (SELECT slug, sum(count)::int count FROM guide_slug_misses GROUP BY slug ORDER BY 2 DESC LIMIT 8) g), '[]'::jsonb),
      'milestones', coalesce((SELECT jsonb_agg(jsonb_build_object('name',um.milestone_name,'when',to_char(um.earned_at,'DD Mon'),
                              'first_name', coalesce(dp.first_name,'Someone'),'user_id',um.user_id::text) ORDER BY um.earned_at DESC)
                            FROM user_milestones um LEFT JOIN diagnostic_profiles dp ON dp.user_id=um.user_id
                            WHERE um.user_id = ANY(ru) AND um.earned_at > now()-interval '7 days'), '[]'::jsonb)
    ),
    'agent', jsonb_build_object(
      'findings_7d', (SELECT count(*) FROM agent_findings WHERE created_at > now()-interval '7 days'),
      'users_covered', (SELECT count(DISTINCT user_id) FROM agent_findings WHERE created_at > now()-interval '7 days'),
      'pending', (SELECT count(*) FROM agent_findings WHERE created_at > now()-interval '7 days' AND status='pending'),
      'became_entries', (SELECT count(*) FROM agent_findings WHERE created_at > now()-interval '7 days' AND entry_id IS NOT NULL),
      'last_night', (SELECT count(*) FROM agent_findings WHERE created_at > now()-interval '24 hours')
    ),
    'jobs', jsonb_build_object(
      'all', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'name', j.jobname, 'schedule', j.schedule, 'active', j.active,
          'ok_24h', (SELECT count(*) FROM cron.job_run_details d WHERE d.jobid=j.jobid AND d.status='succeeded' AND d.start_time > now()-interval '24 hours'),
          'failed_24h', (SELECT count(*) FROM cron.job_run_details d WHERE d.jobid=j.jobid AND d.status='failed' AND d.start_time > now()-interval '24 hours'),
          'last_run', (SELECT max(d.start_time) FROM cron.job_run_details d WHERE d.jobid=j.jobid),
          'last_status', (SELECT d.status FROM cron.job_run_details d WHERE d.jobid=j.jobid ORDER BY d.start_time DESC LIMIT 1)
        ) ORDER BY j.jobname) FROM cron.job j), '[]'::jsonb)
    ),
    'machine', jsonb_build_object(
      'queue_pending', (SELECT count(*) FROM job_queue WHERE status='pending'),
      'queue_failed', (SELECT count(*) FROM job_queue WHERE status='failed'),
      'spend_mtd', coalesce((SELECT round(sum(est_cost_usd)::numeric,2) FROM ai_usage_log WHERE created_at >= date_trunc('month', now())),0),
      'hours_since_capture', (SELECT floor(EXTRACT(epoch FROM now()-max(created_at))/3600)::int FROM entries WHERE user_id = ANY(ru)),
      'api_health', (SELECT jsonb_build_object('checked',checked,'failed',failed,'run_at',run_at) FROM api_health_checks ORDER BY run_at DESC LIMIT 1),
      'open_findings', (SELECT count(*) FROM health_findings WHERE resolved_at IS NULL),
      'handled_24h', (SELECT count(*) FROM ef_error_log WHERE severity='info' AND created_at > now()-interval '24 hours'),
      'errors_24h', coalesce((SELECT jsonb_agg(jsonb_build_object('fn',function_name,'severity',severity,'n',n) ORDER BY n DESC) FROM (
          SELECT function_name, severity, count(*)::int n FROM ef_error_log
          WHERE created_at > now()-interval '24 hours' AND severity IN ('critical','high')
          GROUP BY 1,2 ORDER BY 3 DESC LIMIT 10) e), '[]'::jsonb),
      'open_alerts', coalesce((SELECT jsonb_agg(jsonb_build_object('subject',subject,'severity',severity,'what',what,'impact',impact,'action',action,'source',source) ORDER BY created_at DESC)
          FROM (SELECT * FROM ops_alerts WHERE status='open' ORDER BY created_at DESC LIMIT 12) a), '[]'::jsonb)
    )
  ) INTO out;

  RETURN out;
END;
$function$;
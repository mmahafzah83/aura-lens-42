CREATE OR REPLACE FUNCTION public.admin_cohorts()
RETURNS TABLE(
  cohort_week date, size int,
  captured int, got_signal int, linkedin_live int,
  opened_writer int, has_draft int, published int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  RETURN QUERY
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id <> '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
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
$$;

CREATE OR REPLACE FUNCTION public.admin_stage_timeline(p_days int DEFAULT 90)
RETURNS TABLE(
  day date, signed_up int, finished_setup int, captured int, got_signal int,
  linkedin_live int, opened_writer int, has_draft int, published int
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  RETURN QUERY
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id <> '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
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
$$;

REVOKE ALL ON FUNCTION public.admin_cohorts() FROM public;
REVOKE ALL ON FUNCTION public.admin_stage_timeline(int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_cohorts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_stage_timeline(int) TO authenticated, service_role;
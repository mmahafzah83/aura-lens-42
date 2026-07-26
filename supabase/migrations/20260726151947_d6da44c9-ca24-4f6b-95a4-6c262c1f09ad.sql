-- ============ ship markers ============
CREATE TABLE public.ship_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipped_on date NOT NULL,
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ship_markers TO authenticated;
GRANT ALL ON public.ship_markers TO service_role;

ALTER TABLE public.ship_markers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read ship markers"
  ON public.ship_markers FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admins write ship markers"
  ON public.ship_markers FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admins edit ship markers"
  ON public.ship_markers FOR UPDATE TO authenticated
  USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admins delete ship markers"
  ON public.ship_markers FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

CREATE INDEX ship_markers_shipped_on_idx ON public.ship_markers (shipped_on);

-- ============ RECONSTRUCTED history ============
-- Both functions below derive history NOW from raw timestamps. They are today's
-- understanding of the past, not what the brief reported at the time. The UI
-- must render them as "reconstructed" and never as "recorded".
-- Stage predicates are copied from founder_brief_data so no rival definition exists.

CREATE OR REPLACE FUNCTION public.admin_cohorts()
RETURNS TABLE(
  cohort_week date, size int,
  captured int, got_signal int, linkedin_live int,
  opened_writer int, has_draft int, published int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id <> '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
      AND coalesce(u.email, '') NOT ILIKE '%test%'
  )
  SELECT
    date_trunc('week', ru.created_at)::date AS cohort_week,
    count(*)::int AS size,
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
$$;

REVOKE ALL ON FUNCTION public.admin_cohorts() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_cohorts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_stage_timeline(p_days int DEFAULT 90)
RETURNS TABLE(
  day date, signed_up int, finished_setup int, captured int, got_signal int,
  linkedin_live int, opened_writer int, has_draft int, published int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
  WITH ru AS (
    SELECT u.id, u.created_at
    FROM auth.users u
    WHERE u.id <> '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
      AND coalesce(u.email, '') NOT ILIKE '%test%'
  ),
  reached AS (
    SELECT
      ru.id,
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
    SELECT generate_series(now()::date - greatest(coalesce(p_days, 90), 1) + 1, now()::date, '1 day')::date AS day
  )
  SELECT
    d.day,
    count(*) FILTER (WHERE r.signed_up_on  <= d.day)::int,
    count(*) FILTER (WHERE r.setup_on      <= d.day)::int,
    count(*) FILTER (WHERE r.captured_on   <= d.day)::int,
    count(*) FILTER (WHERE r.signal_on     <= d.day)::int,
    count(*) FILTER (WHERE r.linkedin_on   <= d.day)::int,
    count(*) FILTER (WHERE r.writer_on     <= d.day)::int,
    count(*) FILTER (WHERE r.draft_on      <= d.day)::int,
    count(*) FILTER (WHERE r.published_on  <= d.day)::int
  FROM days d CROSS JOIN reached r
  GROUP BY d.day
  ORDER BY d.day;
$$;

REVOKE ALL ON FUNCTION public.admin_stage_timeline(int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_stage_timeline(int) TO authenticated, service_role;
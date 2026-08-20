-- 1 · request_snapshots
CREATE TABLE IF NOT EXISTS public.request_snapshots (
  id bigserial PRIMARY KEY,
  response_id bigint UNIQUE,
  requested_at timestamptz,
  status_code int,
  error_msg text,
  url text,
  failure_kind text,
  captured_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.request_snapshots TO authenticated;
GRANT ALL ON public.request_snapshots TO service_role;

ALTER TABLE public.request_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read request snapshots" ON public.request_snapshots;
CREATE POLICY "Admins can read request snapshots"
ON public.request_snapshots FOR SELECT TO authenticated
USING (public.is_current_user_admin());

CREATE INDEX IF NOT EXISTS request_snapshots_requested_at_idx ON public.request_snapshots (requested_at DESC);

-- capture function
CREATE OR REPLACE FUNCTION public.capture_request_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  BEGIN
    INSERT INTO public.request_snapshots (response_id, requested_at, status_code, error_msg, url, failure_kind)
    SELECT
      r.id,
      r.created,
      r.status_code,
      r.error_msg,
      q.url,
      CASE
        WHEN r.status_code = 200 THEN 'ok'
        WHEN r.status_code IS NULL AND coalesce(r.error_msg,'') ILIKE '%esolv%' THEN 'never_left'
        WHEN r.status_code IS NULL AND coalesce(r.error_msg,'') ILIKE '%Timeout was reached%'
             AND coalesce(r.error_msg,'') NOT ILIKE '%Connection time%' THEN 'never_left'
        WHEN r.status_code IS NULL AND coalesce(r.error_msg,'') ILIKE '%timeout%' THEN 'timed_out'
        WHEN r.status_code IS NOT NULL AND r.status_code <> 200 THEN 'http_error'
        ELSE 'unknown'
      END
    FROM net._http_response r
    LEFT JOIN net.http_request_queue q ON q.id = r.id
    WHERE NOT EXISTS (SELECT 1 FROM public.request_snapshots s WHERE s.response_id = r.id)
    ON CONFLICT (response_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    DELETE FROM public.request_snapshots WHERE captured_at < now() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_request_snapshots() FROM public;
GRANT EXECUTE ON FUNCTION public.capture_request_snapshots() TO service_role, postgres;

-- 2 · freshness_checks
CREATE TABLE IF NOT EXISTS public.freshness_checks (
  check_key text PRIMARY KEY,
  claim text NOT NULL,
  table_name text NOT NULL,
  timestamp_column text NOT NULL,
  filter_sql text,
  warn_after_hours numeric NOT NULL,
  error_after_hours numeric NOT NULL,
  enabled boolean NOT NULL DEFAULT true
);

GRANT SELECT ON public.freshness_checks TO authenticated;
GRANT ALL ON public.freshness_checks TO service_role;

ALTER TABLE public.freshness_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read freshness checks" ON public.freshness_checks;
CREATE POLICY "Admins can read freshness checks"
ON public.freshness_checks FOR SELECT TO authenticated
USING (public.is_current_user_admin());

INSERT INTO public.freshness_checks (check_key, claim, table_name, timestamp_column, filter_sql, warn_after_hours, error_after_hours)
VALUES
  ('trends_fresh', 'The market scan brought something back today', 'industry_trends', 'fetched_at', NULL, 26, 48),
  ('brief_sent', 'The morning brief was written', 'daily_brief_snapshots', 'created_at', NULL, 26, 30),
  ('signals_written', 'The night produced new signals', 'strategic_signals', 'created_at', NULL, 30, 72),
  ('weekly_drafts', 'Monday''s drafts were written', 'linkedin_posts', 'created_at', 'authorship = ''aura_drafted''', 180, 200),
  ('scores_computed', 'Member scores were recomputed', 'score_snapshots', 'created_at', NULL, 30, 72)
ON CONFLICT (check_key) DO UPDATE SET
  claim = EXCLUDED.claim,
  table_name = EXCLUDED.table_name,
  timestamp_column = EXCLUDED.timestamp_column,
  filter_sql = EXCLUDED.filter_sql,
  warn_after_hours = EXCLUDED.warn_after_hours,
  error_after_hours = EXCLUDED.error_after_hours;

-- freshness report
CREATE OR REPLACE FUNCTION public.cockpit_freshness()
RETURNS TABLE(check_key text, claim text, last_row_at timestamptz, hours_stale numeric, state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c record;
  v_last timestamptz;
  v_hours numeric;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  FOR c IN SELECT * FROM public.freshness_checks WHERE enabled ORDER BY check_key LOOP
    v_last := NULL;
    BEGIN
      EXECUTE format(
        'SELECT max(%I) FROM public.%I %s',
        c.timestamp_column,
        c.table_name,
        CASE WHEN coalesce(c.filter_sql,'') = '' THEN '' ELSE 'WHERE ' || c.filter_sql END
      ) INTO v_last;
    EXCEPTION WHEN OTHERS THEN
      v_last := NULL;
    END;

    IF v_last IS NULL THEN
      check_key := c.check_key; claim := c.claim; last_row_at := NULL;
      hours_stale := NULL; state := 'NO_DATA';
    ELSE
      v_hours := round(EXTRACT(EPOCH FROM (now() - v_last)) / 3600.0, 2);
      check_key := c.check_key; claim := c.claim; last_row_at := v_last; hours_stale := v_hours;
      state := CASE
        WHEN v_hours >= c.error_after_hours THEN 'FAIL'
        WHEN v_hours >= c.warn_after_hours THEN 'WARN'
        ELSE 'OK'
      END;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.cockpit_freshness() FROM public;
GRANT EXECUTE ON FUNCTION public.cockpit_freshness() TO authenticated, service_role;

-- 3 · schedule capture every 5 minutes
SELECT cron.schedule('capture-request-snapshots', '*/5 * * * *', $$SELECT public.capture_request_snapshots();$$);
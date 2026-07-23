
CREATE OR REPLACE FUNCTION public.ops_cron_status(p_hours integer DEFAULT 24)
RETURNS TABLE(
  jobid bigint,
  jobname text,
  schedule text,
  active boolean,
  last_end timestamptz,
  last_status text,
  succeeded_24h integer,
  failed_24h integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','cron'
AS $$
  WITH recent AS (
    SELECT d.jobid, d.status, d.end_time, d.start_time
    FROM cron.job_run_details d
    WHERE d.end_time > now() - interval '8 days'
  ),
  agg AS (
    SELECT jobid,
      SUM(CASE WHEN status='succeeded' AND end_time > now() - (p_hours || ' hours')::interval THEN 1 ELSE 0 END)::int AS s24,
      SUM(CASE WHEN status='failed'    AND end_time > now() - (p_hours || ' hours')::interval THEN 1 ELSE 0 END)::int AS f24
    FROM recent GROUP BY jobid
  ),
  last_run AS (
    SELECT DISTINCT ON (jobid) jobid, end_time, status
    FROM recent
    ORDER BY jobid, end_time DESC
  )
  SELECT j.jobid, j.jobname, j.schedule, j.active,
         l.end_time, l.status,
         COALESCE(a.s24,0), COALESCE(a.f24,0)
  FROM cron.job j
  LEFT JOIN last_run l ON l.jobid = j.jobid
  LEFT JOIN agg a ON a.jobid = j.jobid
  WHERE j.active = true
  ORDER BY j.jobname;
$$;

GRANT EXECUTE ON FUNCTION public.ops_cron_status(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.ops_health_findings_summary(p_hours integer DEFAULT 24)
RETURNS TABLE(open_count integer, newest_title text, newest_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT COUNT(*)::int FROM public.health_findings
      WHERE resolved_at IS NULL AND last_seen > now() - (p_hours || ' hours')::interval),
    (SELECT code FROM public.health_findings
      WHERE resolved_at IS NULL
      ORDER BY last_seen DESC LIMIT 1),
    (SELECT last_seen FROM public.health_findings
      WHERE resolved_at IS NULL
      ORDER BY last_seen DESC LIMIT 1);
$$;

GRANT EXECUTE ON FUNCTION public.ops_health_findings_summary(integer) TO service_role;

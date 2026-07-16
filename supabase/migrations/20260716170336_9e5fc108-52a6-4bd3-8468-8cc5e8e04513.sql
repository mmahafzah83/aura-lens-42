CREATE OR REPLACE FUNCTION public.admin_cron_failures_24h()
RETURNS TABLE(jobname text, failed int, last_fail timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT j.jobname, COUNT(*)::int AS failed, MAX(d.start_time) AS last_fail
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.status = 'failed'
    AND d.start_time >= now() - interval '24 hours'
  GROUP BY j.jobname
  ORDER BY failed DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_cron_failures_24h() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cron_failures_24h() TO service_role;
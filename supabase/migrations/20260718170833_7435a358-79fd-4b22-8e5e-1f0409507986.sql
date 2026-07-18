
CREATE OR REPLACE FUNCTION public.email_crons_ran_without_sends(p_hours int DEFAULT 24)
RETURNS TABLE(crons_ran int, rows_added int, ran_jobs text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  WITH ran AS (
    SELECT DISTINCT j.jobname
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname IN (
      'check-lifecycle-triggers-daily',
      'lifecycle-emails-ksa-daytime',
      'aura-card-nudge-daily'
    )
      AND d.status = 'succeeded'
      AND d.start_time > now() - (p_hours || ' hours')::interval
  )
  SELECT
    (SELECT count(*)::int FROM ran),
    (SELECT count(*)::int FROM public.lifecycle_email_log
       WHERE sent_at > now() - (p_hours || ' hours')::interval),
    (SELECT COALESCE(array_agg(jobname ORDER BY jobname), ARRAY[]::text[]) FROM ran);
$$;

GRANT EXECUTE ON FUNCTION public.email_crons_ran_without_sends(int) TO service_role;

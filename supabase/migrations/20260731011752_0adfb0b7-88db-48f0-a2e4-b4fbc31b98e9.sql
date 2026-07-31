CREATE TABLE public.qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  check_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('pass','fail','warn')),
  detail text,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX qa_runs_run_at_idx ON public.qa_runs (run_at DESC);
CREATE INDEX qa_runs_check_key_idx ON public.qa_runs (check_key);

GRANT SELECT ON public.qa_runs TO authenticated;
GRANT ALL ON public.qa_runs TO service_role;

ALTER TABLE public.qa_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only select" ON public.qa_runs
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

CREATE POLICY "Admin only insert" ON public.qa_runs
  FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.qa_cron_success_jobs(p_hours integer)
RETURNS TABLE(jobname text, runs integer, last_end timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, cron
AS $$
  SELECT j.jobname,
         count(*)::int AS runs,
         max(d.end_time) AS last_end
  FROM cron.job j
  JOIN cron.job_run_details d ON d.jobid = j.jobid
  WHERE d.status = 'succeeded'
    AND d.end_time > now() - make_interval(hours => p_hours)
  GROUP BY j.jobname
$$;

REVOKE ALL ON FUNCTION public.qa_cron_success_jobs(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.qa_cron_success_jobs(integer) TO service_role;
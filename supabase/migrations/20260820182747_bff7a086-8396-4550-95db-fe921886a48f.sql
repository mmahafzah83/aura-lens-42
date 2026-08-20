DROP VIEW IF EXISTS public.jobs_without_outcome_checks;

CREATE OR REPLACE FUNCTION public.undeclared_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.jobid, j.jobname::text, j.schedule::text
  FROM cron.job j
  WHERE j.active
    AND NOT EXISTS (SELECT 1 FROM public.freshness_checks f WHERE f.owning_job = j.jobname)
    AND public.is_current_user_admin();
$$;

REVOKE ALL ON FUNCTION public.undeclared_jobs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undeclared_jobs() TO authenticated, service_role;

CREATE VIEW public.jobs_without_outcome_checks
WITH (security_invoker = on) AS
SELECT * FROM public.undeclared_jobs();

COMMENT ON VIEW public.jobs_without_outcome_checks IS
  'Active scheduled jobs with no row in freshness_checks naming them. An undeclared job is an invisible job. Admin only.';

GRANT SELECT ON public.jobs_without_outcome_checks TO authenticated;
DROP VIEW IF EXISTS public.jobs_without_outcome_checks;

CREATE VIEW public.jobs_without_outcome_checks
WITH (security_invoker = off) AS
SELECT j.jobid, j.jobname, j.schedule
FROM cron.job j
WHERE j.active
  AND NOT EXISTS (
    SELECT 1 FROM public.freshness_checks f WHERE f.owning_job = j.jobname
  )
  AND public.is_current_user_admin();

COMMENT ON VIEW public.jobs_without_outcome_checks IS
  'Active scheduled jobs with no row in freshness_checks naming them. An undeclared job is an invisible job. Admin only.';

GRANT SELECT ON public.jobs_without_outcome_checks TO authenticated;
CREATE OR REPLACE FUNCTION public.posts_attribution()
RETURNS TABLE(total bigint, member bigint, aura bigint, machine bigint, unknown bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- A report must never make "you may not ask" look like "everything is zero".
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT
    count(*),
    count(*) FILTER (WHERE made_by IN ('member','aura_edited_by_member')),
    count(*) FILTER (WHERE made_by = 'aura'),
    count(*) FILTER (WHERE made_by = 'machine'),
    count(*) FILTER (WHERE made_by = 'unknown')
  FROM public.linkedin_posts;
END;
$function$;

CREATE OR REPLACE FUNCTION public.undeclared_jobs()
RETURNS TABLE(jobid bigint, jobname text, schedule text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- The safety net that shows an undeclared job must not read as "all declared".
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT j.jobid, j.jobname::text, j.schedule::text
  FROM cron.job j
  WHERE j.active
    AND NOT EXISTS (
      SELECT 1 FROM public.freshness_checks f WHERE f.owning_job = j.jobname
    );
END;
$function$;
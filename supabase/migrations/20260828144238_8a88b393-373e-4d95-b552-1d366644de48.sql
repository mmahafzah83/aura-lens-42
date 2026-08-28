CREATE OR REPLACE FUNCTION public.start_assessment_run(p_token text, p_daily_cap integer DEFAULT 200)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_runs int; v_today int; v_is_admin boolean := false;
begin
  -- Reuse the existing admin concept: a row in public.user_roles, read via has_role().
  if auth.uid() is not null then
    v_is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  end if;

  select runs_started into v_runs from public.assessment_sessions
    where token = p_token and user_id is null and expires_at > now();
  if v_runs is null then raise exception 'NO_SESSION' using errcode='P0001'; end if;
  if not v_is_admin and v_runs >= 3 then raise exception 'RUN_ALREADY_USED' using errcode='P0001'; end if;
  if not v_is_admin then
    select coalesce(sum(runs_started),0) into v_today from public.assessment_sessions
      where created_at > now() - interval '24 hours';
    if v_today >= p_daily_cap then raise exception 'DAILY_CEILING' using errcode='P0001'; end if;
  end if;
  update public.assessment_sessions set runs_started = runs_started + 1, last_seen_at = now()
    where token = p_token;
  return true;
end $function$;
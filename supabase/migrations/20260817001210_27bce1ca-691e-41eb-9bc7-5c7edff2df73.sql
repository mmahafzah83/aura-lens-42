CREATE OR REPLACE FUNCTION public.get_assessment_session(p_token text)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, expires_at timestamp with time zone, runs_started integer, state jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.assessment_sessions s set last_seen_at = now()
    where s.token = p_token and s.user_id is null and s.expires_at > now();
  return query
    select s.id, s.created_at, s.expires_at, s.runs_started, s.state
    from public.assessment_sessions s
    where s.token = p_token and s.user_id is null and s.expires_at > now();
end $function$;
ALTER VIEW public.daily_brief_latest SET (security_invoker = on);

REVOKE ALL ON FUNCTION public.record_brief_run(date, jsonb, jsonb, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_brief_run(date, jsonb, jsonb, boolean, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.brief_history(days int DEFAULT 30)
RETURNS TABLE(brief_date date, runs int, sent boolean, funnel jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Deliberately reports the FIRST run of each day. The first run is the honest
  -- one: it is what was actually true that morning, before anyone pressed
  -- refresh. Using the latest run would let today's refresh silently rewrite
  -- last week's trend line.
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  RETURN QUERY
  SELECT
    s.brief_date,
    count(*)::int,
    bool_or(s.is_sent),
    (SELECT f.payload->'funnel'
       FROM public.daily_brief_snapshots f
      WHERE f.brief_date = s.brief_date
      ORDER BY f.run_seq ASC
      LIMIT 1)
  FROM public.daily_brief_snapshots s
  WHERE s.brief_date > (now()::date - greatest(coalesce(days, 30), 1))
  GROUP BY s.brief_date
  ORDER BY s.brief_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.brief_history(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brief_history(int) TO authenticated, service_role;
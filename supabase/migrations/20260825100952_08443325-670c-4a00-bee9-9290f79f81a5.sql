DROP FUNCTION IF EXISTS public.home_record_themes(date, date, uuid);

CREATE OR REPLACE FUNCTION public.home_record_themes(
  p_from date,
  p_to date,
  p_uid uuid DEFAULT NULL,
  p_tz text DEFAULT 'UTC'
)
RETURNS TABLE(id uuid, title text, created_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.signal_title, s.created_at
  FROM public.strategic_signals s
  WHERE s.user_id = COALESCE(p_uid, auth.uid())
    AND (COALESCE(p_uid, auth.uid()) = auth.uid() OR public.is_current_user_admin())
    AND (s.created_at AT TIME ZONE p_tz)::date >= p_from
    AND (s.created_at AT TIME ZONE p_tz)::date <= p_to
  ORDER BY s.created_at DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.home_record_themes(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.home_record_themes(date, date, uuid, text) TO service_role;
CREATE OR REPLACE FUNCTION public.founding_seats()
RETURNS TABLE (claimed integer, cap integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::integer FROM public.beta_allowlist WHERE status IN ('invited','active')) AS claimed,
    50::integer AS cap;
$$;

REVOKE ALL ON FUNCTION public.founding_seats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founding_seats() TO anon, authenticated;
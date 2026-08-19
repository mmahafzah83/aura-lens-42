CREATE OR REPLACE FUNCTION public.founding_reservations()
RETURNS TABLE (claimed integer, cap integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::integer FROM public.beta_allowlist WHERE ref LIKE 'reserve\_69%') AS claimed,
    50::integer AS cap;
$$;

REVOKE ALL ON FUNCTION public.founding_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.founding_reservations() TO anon, authenticated;
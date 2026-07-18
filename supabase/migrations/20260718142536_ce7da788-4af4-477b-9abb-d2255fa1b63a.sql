REVOKE EXECUTE ON FUNCTION public.bump_signal_engagement(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bump_signal_engagement(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.bump_signal_engagement(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.oe_host_is_skipped(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_enforce_skipped_hosts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_host_is_skipped(text) TO service_role;
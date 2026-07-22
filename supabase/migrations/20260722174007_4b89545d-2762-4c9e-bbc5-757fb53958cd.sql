
REVOKE EXECUTE ON FUNCTION public.reconcile_signal_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_signal_counts() TO service_role;

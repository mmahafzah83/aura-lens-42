ALTER TABLE IF EXISTS public.deleted_test_accounts_20260818 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_test_accounts_20260818 FROM anon, authenticated;
GRANT ALL ON public.deleted_test_accounts_20260818 TO service_role;
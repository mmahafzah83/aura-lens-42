
REVOKE ALL ON FUNCTION public.oe_rebuild_eligibility(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_notebook_rebuild() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_notebook_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_rebuild_eligibility(uuid) TO service_role;

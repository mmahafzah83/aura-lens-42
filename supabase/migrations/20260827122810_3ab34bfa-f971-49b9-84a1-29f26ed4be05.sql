REVOKE ALL ON FUNCTION public.resolve_member_handle(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalise_linkedin_handle(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_member_handle(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalise_linkedin_handle(text) TO authenticated, service_role;
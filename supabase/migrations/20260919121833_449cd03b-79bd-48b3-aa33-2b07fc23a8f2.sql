
ALTER FUNCTION public.oe_route_is_specific(text,text) SET search_path TO 'public';
ALTER FUNCTION public.oe_place_country(text) SET search_path TO 'public';
REVOKE ALL ON FUNCTION public.oe_derive_access_state() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_derive_access_state() TO service_role;
REVOKE ALL ON FUNCTION public.oe_matches_act_requires_route() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_investigate_unknowns(uuid) FROM anon, authenticated;

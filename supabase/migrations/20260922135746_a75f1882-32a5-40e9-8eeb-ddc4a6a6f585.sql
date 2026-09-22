REVOKE ALL ON FUNCTION public.oe_member_home(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_member_home(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.oe_my_home()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ select public.oe_member_home(auth.uid()) $function$;
REVOKE ALL ON FUNCTION public.oe_my_home() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_my_home() TO authenticated;
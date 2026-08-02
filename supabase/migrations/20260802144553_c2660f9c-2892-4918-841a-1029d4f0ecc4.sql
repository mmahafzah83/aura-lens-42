ALTER VIEW public.cockpit_members SET (security_invoker = true);
REVOKE ALL ON public.cockpit_members FROM anon, authenticated;
GRANT SELECT ON public.cockpit_members TO service_role;
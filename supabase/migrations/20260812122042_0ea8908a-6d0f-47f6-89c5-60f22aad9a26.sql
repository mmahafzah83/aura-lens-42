ALTER VIEW public.cockpit_assertions SET (security_invoker = on);
ALTER VIEW public.morning_promise_state SET (security_invoker = on);
REVOKE ALL ON public.cockpit_assertions FROM anon;
REVOKE ALL ON public.morning_promise_state FROM anon;
GRANT SELECT ON public.cockpit_assertions TO service_role;
GRANT SELECT ON public.morning_promise_state TO service_role;
ALTER VIEW public.member_accounts SET (security_invoker = on);
ALTER VIEW public.aura_output SET (security_invoker = on);
ALTER VIEW public.cockpit_members SET (security_invoker = on);
ALTER VIEW public.cockpit_pulse SET (security_invoker = on);
ALTER VIEW public.cockpit_assertions SET (security_invoker = on);
ALTER VIEW public.daily_brief_latest SET (security_invoker = on);
ALTER VIEW public.ef_faults SET (security_invoker = on);
ALTER VIEW public.influence_dashboard_view SET (security_invoker = on);
ALTER VIEW public.influence_timeline SET (security_invoker = on);
ALTER VIEW public.linkedin_connections_safe SET (security_invoker = on);
ALTER VIEW public.post_provenance SET (security_invoker = on);
ALTER VIEW public.unified_content SET (security_invoker = on);

REVOKE ALL ON public.member_accounts FROM anon, authenticated;
REVOKE ALL ON public.aura_output FROM anon, authenticated;
REVOKE ALL ON public.cockpit_members FROM anon, authenticated;
REVOKE ALL ON public.cockpit_pulse FROM anon, authenticated;
REVOKE ALL ON public.cockpit_assertions FROM anon, authenticated;
REVOKE ALL ON public.ef_faults FROM anon, authenticated;

REVOKE ALL ON public.daily_brief_latest FROM anon;
REVOKE ALL ON public.influence_dashboard_view FROM anon;
REVOKE ALL ON public.influence_timeline FROM anon;
REVOKE ALL ON public.linkedin_connections_safe FROM anon;
REVOKE ALL ON public.post_provenance FROM anon;
REVOKE ALL ON public.unified_content FROM anon;

GRANT SELECT ON public.daily_brief_latest TO authenticated;
GRANT SELECT ON public.influence_dashboard_view TO authenticated;
GRANT SELECT ON public.influence_timeline TO authenticated;
GRANT SELECT ON public.linkedin_connections_safe TO authenticated;
GRANT SELECT ON public.post_provenance TO authenticated;
GRANT SELECT ON public.unified_content TO authenticated;

GRANT ALL ON public.member_accounts TO service_role;
GRANT ALL ON public.aura_output TO service_role;
GRANT ALL ON public.cockpit_members TO service_role;
GRANT ALL ON public.cockpit_pulse TO service_role;
GRANT ALL ON public.cockpit_assertions TO service_role;
GRANT ALL ON public.ef_faults TO service_role;
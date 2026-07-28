DROP FUNCTION IF EXISTS public.momentum_funnel();

CREATE FUNCTION public.momentum_funnel()
 RETURNS TABLE(captures integer, used_in_signal integer, signals integer, published integer, published_through_aura integer, published_live integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH aura AS (
    SELECT count(*)::int AS n FROM public.linkedin_posts p
    WHERE p.user_id = auth.uid()
      AND (p.source_type, p.tracking_status) IN (('aura_generated','published'),('carousel_studio','published'))
  ), live AS (
    SELECT count(*)::int AS n FROM public.linkedin_posts p
    WHERE p.user_id = auth.uid()
      AND (p.source_type, p.tracking_status) IN (
        ('aura_generated','published'),('carousel_studio','published'),
        ('linkedin_export','tracked'),('browser_capture','confirmed'),
        ('browser_capture','metrics_imported'),('search_discovery','confirmed'),
        ('manual_url','manual'))
  )
  SELECT
    (SELECT count(*)::int FROM public.entries e WHERE e.user_id = auth.uid()),
    (SELECT count(DISTINCT e.id)::int FROM public.entries e
      WHERE e.user_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.source_registry sr
          JOIN public.evidence_fragments ef ON ef.source_registry_id = sr.id
          JOIN public.strategic_signals s ON ef.id = ANY(s.supporting_evidence_ids)
          WHERE sr.source_id = e.id AND s.user_id = auth.uid()
        )),
    (SELECT count(*)::int FROM public.strategic_signals s WHERE s.user_id = auth.uid()),
    (SELECT n FROM aura),
    (SELECT n FROM aura),
    (SELECT n FROM live)
$function$;

REVOKE ALL ON FUNCTION public.momentum_funnel() FROM public;
GRANT EXECUTE ON FUNCTION public.momentum_funnel() TO authenticated;
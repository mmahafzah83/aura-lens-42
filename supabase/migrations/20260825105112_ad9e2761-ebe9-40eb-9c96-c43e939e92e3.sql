CREATE OR REPLACE FUNCTION public.momentum_funnel()
 RETURNS TABLE(captures integer, used_in_signal integer, signals integer, published integer, published_through_aura integer, published_live integer, published_sent_from_aura integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pp AS (
    SELECT provenance FROM public.post_provenance WHERE user_id = auth.uid()
  ),
  aura AS (SELECT count(*)::int AS n FROM pp WHERE provenance IN ('aura_published','aura_drafted')),
  sent AS (SELECT count(*)::int AS n FROM pp WHERE provenance = 'aura_published'),
  live AS (SELECT count(*)::int AS n FROM pp)
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
    (SELECT count(*)::int FROM public.strategic_signals s
      WHERE s.user_id = auth.uid() AND s.status IN ('active','dormant')),
    (SELECT n FROM aura),
    (SELECT n FROM aura),
    (SELECT n FROM live),
    (SELECT n FROM sent)
$function$;
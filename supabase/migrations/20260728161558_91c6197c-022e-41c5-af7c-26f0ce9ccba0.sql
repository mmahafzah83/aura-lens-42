CREATE OR REPLACE FUNCTION public.momentum_funnel()
RETURNS TABLE(captures integer, used_in_signal integer, signals integer, published integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    (SELECT count(*)::int FROM public.linkedin_posts p WHERE p.user_id = auth.uid() AND p.tracking_status = 'published')
$$;

REVOKE ALL ON FUNCTION public.momentum_funnel() FROM public;
GRANT EXECUTE ON FUNCTION public.momentum_funnel() TO authenticated;
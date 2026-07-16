
CREATE OR REPLACE FUNCTION public.pending_capture_entries(
  p_limit int DEFAULT 25,
  p_min_age_minutes int DEFAULT 10,
  p_max_attempts int DEFAULT 3
)
RETURNS TABLE(id uuid, user_id uuid, extract_attempts int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.user_id, e.extract_attempts
  FROM public.entries e
  WHERE e.created_at < now() - (p_min_age_minutes || ' minutes')::interval
    AND e.extract_attempts < p_max_attempts
    AND NOT EXISTS (
      SELECT 1 FROM public.source_registry sr
      WHERE sr.source_type = 'entry'
        AND sr.source_id = e.id
        AND sr.processed = true
    )
  ORDER BY e.created_at ASC
  LIMIT p_limit;
$$;

REVOKE ALL ON FUNCTION public.pending_capture_entries(int, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pending_capture_entries(int, int, int) FROM anon;
REVOKE ALL ON FUNCTION public.pending_capture_entries(int, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pending_capture_entries(int, int, int) TO service_role;

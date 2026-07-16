CREATE OR REPLACE FUNCTION public.recent_cron_http_failures(p_minutes int DEFAULT 90)
RETURNS TABLE(status_code int, failures bigint, sample_error text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, net
AS $$
  SELECT
    r.status_code::int AS status_code,
    COUNT(*)::bigint AS failures,
    (ARRAY_AGG(COALESCE(NULLIF(r.error_msg, ''), LEFT(r.content, 300)) ORDER BY r.created DESC))[1] AS sample_error
  FROM net._http_response r
  WHERE r.created > now() - (p_minutes || ' minutes')::interval
    AND (r.status_code IS NULL OR r.status_code >= 400)
  GROUP BY r.status_code
  ORDER BY failures DESC;
$$;

REVOKE ALL ON FUNCTION public.recent_cron_http_failures(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recent_cron_http_failures(int) FROM anon;
REVOKE ALL ON FUNCTION public.recent_cron_http_failures(int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recent_cron_http_failures(int) TO service_role;
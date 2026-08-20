CREATE OR REPLACE FUNCTION public.classify_request_failure(p_status int, p_error text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_status = 200 THEN 'ok'
    WHEN p_status IS NOT NULL AND p_status <> 200 THEN 'http_error'
    WHEN p_status IS NULL AND coalesce(p_error,'') ILIKE '%timeout%' THEN
      CASE
        WHEN (substring(p_error from 'DNS time: ([0-9.]+)'))::numeric IS NOT NULL
             AND (substring(p_error from 'Total time: ([0-9.]+)'))::numeric IS NOT NULL
             AND (substring(p_error from 'DNS time: ([0-9.]+)'))::numeric
                 >= 0.9 * (substring(p_error from 'Total time: ([0-9.]+)'))::numeric
        THEN 'never_left'
        ELSE 'timed_out'
      END
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.capture_request_snapshots()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, pg_temp
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  BEGIN
    INSERT INTO public.request_snapshots (response_id, requested_at, status_code, error_msg, url, failure_kind)
    SELECT r.id, r.created, r.status_code, r.error_msg, q.url,
           public.classify_request_failure(r.status_code, r.error_msg)
    FROM net._http_response r
    LEFT JOIN net.http_request_queue q ON q.id = r.id
    WHERE NOT EXISTS (SELECT 1 FROM public.request_snapshots s WHERE s.response_id = r.id)
    ON CONFLICT (response_id) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    DELETE FROM public.request_snapshots WHERE captured_at < now() - interval '30 days';
  EXCEPTION WHEN OTHERS THEN
    RETURN 0;
  END;
  RETURN v_inserted;
END;
$$;

UPDATE public.request_snapshots
SET failure_kind = public.classify_request_failure(status_code, error_msg)
WHERE failure_kind IS DISTINCT FROM public.classify_request_failure(status_code, error_msg);

REVOKE ALL ON FUNCTION public.classify_request_failure(int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.classify_request_failure(int, text) TO service_role, postgres;
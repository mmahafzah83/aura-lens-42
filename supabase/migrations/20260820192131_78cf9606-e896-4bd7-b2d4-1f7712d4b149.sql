-- 1 · a member may read their own runs, and only their own
GRANT SELECT ON public.operation_runs TO authenticated;

DROP POLICY IF EXISTS "members read their own runs" ON public.operation_runs;
CREATE POLICY "members read their own runs"
ON public.operation_runs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 2 · make the row observable live
ALTER TABLE public.operation_runs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'operation_runs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.operation_runs';
  END IF;
END $$;

-- 3 · the anonymous path: an exact run id plus the session token that owns it
CREATE OR REPLACE FUNCTION public.get_run_stages(p_run_id uuid, p_anon_token text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'stages', r.stages,
           'outcome', r.outcome,
           'reason_code', r.reason_code,
           'finished_at', r.finished_at
         )
  FROM public.operation_runs r
  WHERE r.id = p_run_id
    AND (
      (auth.uid() IS NOT NULL AND r.user_id = auth.uid())
      OR (p_anon_token IS NOT NULL AND r.anon_token = p_anon_token)
    )
$$;

REVOKE ALL ON FUNCTION public.get_run_stages(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_run_stages(uuid, text) TO anon, authenticated, service_role;
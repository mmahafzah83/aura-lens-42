CREATE TABLE public.ef_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text,
  severity text,
  error_message text,
  user_id uuid,
  context jsonb DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.ef_event_log TO authenticated;
GRANT ALL ON public.ef_event_log TO service_role;
ALTER TABLE public.ef_event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read ef event log" ON public.ef_event_log FOR SELECT USING (is_current_user_admin());
CREATE INDEX ef_event_log_created_at_idx ON public.ef_event_log (created_at DESC);
CREATE INDEX ef_event_log_function_name_idx ON public.ef_event_log (function_name);
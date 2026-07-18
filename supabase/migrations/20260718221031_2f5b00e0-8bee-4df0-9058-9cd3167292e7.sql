
CREATE TABLE public.output_leak_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  function_name text,
  language text,
  leak_stage text,
  first_lines text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.output_leak_log TO service_role;
GRANT SELECT ON public.output_leak_log TO authenticated;

ALTER TABLE public.output_leak_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view leak log"
  ON public.output_leak_log
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE INDEX idx_output_leak_log_created_at ON public.output_leak_log (created_at DESC);
CREATE INDEX idx_output_leak_log_stage ON public.output_leak_log (leak_stage, created_at DESC);

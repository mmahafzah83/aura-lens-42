CREATE TABLE public.ops_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  subject text,
  body text,
  severity text,
  source text,
  emailed boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.ops_alerts TO authenticated;
GRANT ALL ON public.ops_alerts TO service_role;

ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ops alerts"
  ON public.ops_alerts
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE INDEX ops_alerts_source_created_idx ON public.ops_alerts (source, created_at DESC);
CREATE INDEX ops_alerts_created_idx ON public.ops_alerts (created_at DESC);
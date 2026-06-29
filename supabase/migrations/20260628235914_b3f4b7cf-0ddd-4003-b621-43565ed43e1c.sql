CREATE TABLE public.api_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.api_health_checks TO service_role;
GRANT SELECT ON public.api_health_checks TO authenticated;

ALTER TABLE public.api_health_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view API health checks"
  ON public.api_health_checks
  FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());


CREATE TABLE public.health_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','warn','info')),
  detail text NOT NULL,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX health_findings_open_code_uidx
  ON public.health_findings (code)
  WHERE resolved_at IS NULL;

CREATE INDEX health_findings_last_seen_idx
  ON public.health_findings (last_seen DESC);

GRANT ALL ON public.health_findings TO service_role;

ALTER TABLE public.health_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read health_findings"
  ON public.health_findings FOR SELECT
  TO authenticated
  USING (public.is_current_user_admin());

CREATE TRIGGER trg_health_findings_updated_at
  BEFORE UPDATE ON public.health_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

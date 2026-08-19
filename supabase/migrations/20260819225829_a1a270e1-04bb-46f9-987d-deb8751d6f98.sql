CREATE TABLE public.operation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text,
  reason_code text,
  attempt integer NOT NULL DEFAULT 1,
  user_id uuid,
  anon_token text,
  fingerprint_hash text,
  cost_usd numeric,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT ALL ON public.operation_runs TO service_role;

ALTER TABLE public.operation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operation_runs service role only"
  ON public.operation_runs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX operation_runs_operation_started_idx ON public.operation_runs (operation, started_at DESC);
CREATE INDEX operation_runs_outcome_idx ON public.operation_runs (outcome);

ALTER TABLE public.mirror_requests ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ok';
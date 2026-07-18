CREATE TABLE public.evidence_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_registry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  cursor integer NOT NULL DEFAULT 0,
  total integer,
  fragments_written integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evidence_jobs_status_heartbeat_idx
  ON public.evidence_jobs (status, last_heartbeat);
CREATE INDEX evidence_jobs_source_registry_idx
  ON public.evidence_jobs (source_registry_id);

GRANT SELECT ON public.evidence_jobs TO authenticated;
GRANT ALL ON public.evidence_jobs TO service_role;

ALTER TABLE public.evidence_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own evidence jobs"
  ON public.evidence_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
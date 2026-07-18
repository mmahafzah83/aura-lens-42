
CREATE TABLE IF NOT EXISTS public.document_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  stage text NOT NULL DEFAULT 'queued',
  cursor int NOT NULL DEFAULT 0,
  total int,
  slice_size int NOT NULL DEFAULT 25,
  attempts int NOT NULL DEFAULT 0,
  peak_memory_mb int,
  failure_code text,
  error_detail text,
  last_heartbeat timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_jobs_stage_heartbeat_idx
  ON public.document_jobs (stage, last_heartbeat);
CREATE INDEX IF NOT EXISTS document_jobs_document_id_idx
  ON public.document_jobs (document_id);

GRANT SELECT ON public.document_jobs TO authenticated;
GRANT ALL ON public.document_jobs TO service_role;

ALTER TABLE public.document_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own document_jobs" ON public.document_jobs;
CREATE POLICY "Users can view own document_jobs" ON public.document_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

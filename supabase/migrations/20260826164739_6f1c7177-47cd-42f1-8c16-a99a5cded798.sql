ALTER TABLE public.evidence_fragments ADD COLUMN IF NOT EXISTS pipeline_version smallint NOT NULL DEFAULT 1;
ALTER TABLE public.strategic_signals ADD COLUMN IF NOT EXISTS pipeline_version smallint NOT NULL DEFAULT 1;
ALTER TABLE public.document_chunks ADD COLUMN IF NOT EXISTS pipeline_version smallint NOT NULL DEFAULT 1;

UPDATE public.evidence_fragments SET pipeline_version = 1 WHERE pipeline_version IS DISTINCT FROM 1;
UPDATE public.strategic_signals SET pipeline_version = 1 WHERE pipeline_version IS DISTINCT FROM 1;
UPDATE public.document_chunks SET pipeline_version = 1 WHERE pipeline_version IS DISTINCT FROM 1;

CREATE INDEX IF NOT EXISTS idx_evidence_fragments_pipeline_version
  ON public.evidence_fragments (pipeline_version);

CREATE TABLE IF NOT EXISTS public.retrieval_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  caller text NOT NULL,
  query text,
  query_len int,
  result_count int,
  kinds jsonb,
  top_rank real,
  degraded boolean NOT NULL DEFAULT false,
  error text,
  latency_ms int,
  pipeline_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.retrieval_logs TO authenticated;
GRANT ALL ON public.retrieval_logs TO service_role;

ALTER TABLE public.retrieval_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_retrieval_logs_user_created
  ON public.retrieval_logs (user_id, created_at DESC);

CREATE POLICY "Users can view their own retrieval logs"
  ON public.retrieval_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages retrieval logs"
  ON public.retrieval_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);
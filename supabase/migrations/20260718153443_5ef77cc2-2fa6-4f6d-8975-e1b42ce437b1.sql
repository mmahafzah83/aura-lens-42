ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS documents_status_processing_started_at_idx
  ON public.documents (status, processing_started_at)
  WHERE status = 'processing';
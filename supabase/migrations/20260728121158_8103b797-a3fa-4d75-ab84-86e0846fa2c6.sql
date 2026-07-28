ALTER TABLE public.source_registry ADD COLUMN IF NOT EXISTS signal_status text;
CREATE INDEX IF NOT EXISTS idx_source_registry_signal_status
  ON public.source_registry (processed, signal_status, processed_at);
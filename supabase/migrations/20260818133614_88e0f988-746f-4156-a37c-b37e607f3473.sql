ALTER TABLE public.content_gate_results
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS expected_ending text;

CREATE INDEX IF NOT EXISTS content_gate_results_content_hash_idx ON public.content_gate_results (content_hash);

CREATE TABLE IF NOT EXISTS public.content_gate_cache (
  content_hash text PRIMARY KEY,
  verdict jsonb NOT NULL,
  judge_model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.content_gate_cache TO service_role;
ALTER TABLE public.content_gate_cache ENABLE ROW LEVEL SECURITY;
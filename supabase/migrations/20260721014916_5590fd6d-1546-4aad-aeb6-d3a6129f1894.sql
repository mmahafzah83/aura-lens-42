
-- Agent findings table
CREATE TABLE IF NOT EXISTS public.agent_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  url text,
  title text,
  source text,
  relevance_score numeric,
  implication text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','kept','dismissed','below_bar','duplicate','error','skipped')),
  entry_id uuid,
  perplexity_raw jsonb,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_findings TO authenticated;
GRANT ALL ON public.agent_findings TO service_role;

ALTER TABLE public.agent_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent findings"
  ON public.agent_findings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS agent_findings_user_created_idx
  ON public.agent_findings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_findings_user_status_idx
  ON public.agent_findings (user_id, status);

-- Entries source_type column (default preserves existing insert paths)
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user';

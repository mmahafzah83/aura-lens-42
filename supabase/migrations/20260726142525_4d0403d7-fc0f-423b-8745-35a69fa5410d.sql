CREATE TABLE public.content_gate_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  post_id uuid,
  function_name text,
  language text,
  overall_score integer,
  pass boolean,
  assertions jsonb,
  weaknesses jsonb,
  skipped boolean NOT NULL DEFAULT false,
  skip_reason text,
  judge_model text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.content_gate_results TO authenticated;
GRANT ALL ON public.content_gate_results TO service_role;

ALTER TABLE public.content_gate_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own gate results"
ON public.content_gate_results FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert gate results"
ON public.content_gate_results FOR INSERT TO service_role
WITH CHECK (true);

CREATE INDEX idx_content_gate_results_user_created ON public.content_gate_results (user_id, created_at DESC);
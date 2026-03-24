
CREATE TABLE public.framework_activations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid NOT NULL REFERENCES public.master_frameworks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  output_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.framework_activations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own activations" ON public.framework_activations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own activations" ON public.framework_activations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own activations" ON public.framework_activations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own activations" ON public.framework_activations FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_framework_activations_framework ON public.framework_activations(framework_id);
CREATE INDEX idx_framework_activations_user ON public.framework_activations(user_id);

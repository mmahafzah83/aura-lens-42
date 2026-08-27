CREATE TABLE public.desk_eval_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  question text NOT NULL,
  expects text NOT NULL,
  trap boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desk_eval_questions TO authenticated;
GRANT ALL ON public.desk_eval_questions TO service_role;
ALTER TABLE public.desk_eval_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage desk_eval_questions" ON public.desk_eval_questions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.desk_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.desk_eval_questions(id) ON DELETE CASCADE,
  run_at timestamptz NOT NULL DEFAULT now(),
  answer text,
  mode_detected text,
  verdict text CHECK (verdict IN ('pass','fail','partial')),
  failure_kind text,
  notes text
);
CREATE INDEX desk_eval_runs_question_idx ON public.desk_eval_runs(question_id, run_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.desk_eval_runs TO authenticated;
GRANT ALL ON public.desk_eval_runs TO service_role;
ALTER TABLE public.desk_eval_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage desk_eval_runs" ON public.desk_eval_runs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
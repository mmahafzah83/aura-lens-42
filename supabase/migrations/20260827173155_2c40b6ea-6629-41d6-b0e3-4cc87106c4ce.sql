CREATE TABLE public.desk_number_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  run_at timestamptz NOT NULL DEFAULT now(),
  question text,
  figure text NOT NULL,
  resolved text NOT NULL CHECK (resolved IN ('retry_fixed','sentence_dropped')),
  answer_excerpt text
);

GRANT ALL ON public.desk_number_violations TO service_role;
GRANT SELECT ON public.desk_number_violations TO authenticated;

ALTER TABLE public.desk_number_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read number violations"
  ON public.desk_number_violations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX desk_number_violations_run_at_idx ON public.desk_number_violations (run_at DESC);
CREATE TABLE public.signature_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  family text,
  lang text,
  action text NOT NULL CHECK (action IN ('suggested','picked','edited','exported','published')),
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.signature_events TO authenticated;
GRANT ALL ON public.signature_events TO service_role;

ALTER TABLE public.signature_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own signature events"
  ON public.signature_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own signature events"
  ON public.signature_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX signature_events_user_created_idx
  ON public.signature_events (user_id, created_at DESC);
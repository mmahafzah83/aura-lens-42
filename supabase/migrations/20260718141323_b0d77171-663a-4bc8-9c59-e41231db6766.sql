
CREATE TABLE public.signal_engagements (
  user_id uuid NOT NULL,
  signal_id uuid NOT NULL,
  open_count int NOT NULL DEFAULT 0,
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, signal_id)
);

GRANT SELECT, INSERT, UPDATE ON public.signal_engagements TO authenticated;
GRANT ALL ON public.signal_engagements TO service_role;

ALTER TABLE public.signal_engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own signal engagements"
  ON public.signal_engagements FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own signal engagements"
  ON public.signal_engagements FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own signal engagements"
  ON public.signal_engagements FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

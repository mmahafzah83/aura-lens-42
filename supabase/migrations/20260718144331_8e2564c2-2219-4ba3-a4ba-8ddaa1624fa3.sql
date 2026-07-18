CREATE TABLE public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  session_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX product_events_user_time_idx ON public.product_events (user_id, occurred_at DESC);
CREATE INDEX product_events_event_time_idx ON public.product_events (event, occurred_at DESC);
GRANT SELECT, INSERT ON public.product_events TO authenticated;
GRANT ALL ON public.product_events TO service_role;
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users insert own product events"
  ON public.product_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own product events"
  ON public.product_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
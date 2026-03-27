CREATE TABLE public.discovery_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  candidate_url text NOT NULL,
  snippet text,
  confidence numeric NOT NULL DEFAULT 0,
  rejection_reason text NOT NULL DEFAULT 'authorship_uncertain',
  authorship_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.discovery_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own review candidates"
  ON public.discovery_review_queue FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own review candidates"
  ON public.discovery_review_queue FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own review candidates"
  ON public.discovery_review_queue FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own review candidates"
  ON public.discovery_review_queue FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_review_queue_url_user ON public.discovery_review_queue (user_id, candidate_url);
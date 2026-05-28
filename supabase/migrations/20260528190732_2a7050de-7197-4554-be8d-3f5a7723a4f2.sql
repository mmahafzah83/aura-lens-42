CREATE TABLE IF NOT EXISTS public.audience_insights (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  insight_headline text NOT NULL,
  insight_body text NOT NULL,
  audience_strengths text[],
  audience_gaps text[],
  next_action text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  demographics_hash text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_insights TO authenticated;
GRANT ALL ON public.audience_insights TO service_role;

ALTER TABLE public.audience_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own audience insights"
  ON public.audience_insights FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_audience_insights_user
  ON public.audience_insights(user_id);
CREATE TABLE IF NOT EXISTS public.impact_narratives (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hero_narrative text NOT NULL,
  footprint_insight text NOT NULL,
  content_insight text NOT NULL,
  post_insight text NOT NULL,
  one_action text NOT NULL,
  data_hash text,
  generated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.impact_narratives TO authenticated;
GRANT ALL ON public.impact_narratives TO service_role;

ALTER TABLE public.impact_narratives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own impact narratives"
  ON public.impact_narratives FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_impact_narratives_user
  ON public.impact_narratives(user_id);
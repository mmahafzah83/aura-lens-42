CREATE TABLE IF NOT EXISTS public.audience_demographics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL,
  value text NOT NULL,
  percentage text NOT NULL,
  percentage_numeric numeric,
  imported_at timestamptz DEFAULT now(),
  source_type text DEFAULT 'linkedin_export'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_demographics TO authenticated;
GRANT ALL ON public.audience_demographics TO service_role;

ALTER TABLE public.audience_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own demographics"
  ON public.audience_demographics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own demographics"
  ON public.audience_demographics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own demographics"
  ON public.audience_demographics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_audience_demographics_user_cat
  ON public.audience_demographics(user_id, category);

ALTER TABLE public.influence_snapshots
  ADD COLUMN IF NOT EXISTS members_reached integer,
  ADD COLUMN IF NOT EXISTS total_impressions_annual integer;
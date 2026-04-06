ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS brand_assessment_answers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_assessment_results jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brand_assessment_completed_at timestamptz DEFAULT NULL;
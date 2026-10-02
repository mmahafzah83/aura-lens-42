ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS brand_assessment_answers_coded jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.diagnostic_profiles.brand_assessment_answers_coded IS
  'Assessment answers keyed by onboarding_questions.id, holding option values (stable codes), never display labels.';
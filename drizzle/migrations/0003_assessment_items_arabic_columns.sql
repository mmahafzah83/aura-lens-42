ALTER TABLE public.onboarding_questions
  ADD COLUMN IF NOT EXISTS prompt_ar text,
  ADD COLUMN IF NOT EXISTS helper_ar text,
  ADD COLUMN IF NOT EXISTS why_asked_ar text;

ALTER TABLE public.capability_dimensions
  ADD COLUMN IF NOT EXISTS name_ar text,
  ADD COLUMN IF NOT EXISTS why_line_ar text,
  ADD COLUMN IF NOT EXISTS anchor_low_ar text,
  ADD COLUMN IF NOT EXISTS anchor_mid_ar text,
  ADD COLUMN IF NOT EXISTS anchor_high_ar text;

COMMENT ON COLUMN public.onboarding_questions.prompt_ar IS 'Arabic display text for prompt. Display only; answers and model input use the English prompt.';
COMMENT ON COLUMN public.capability_dimensions.name_ar IS 'Arabic display name. Display only; slider scores stay keyed by the English name.';
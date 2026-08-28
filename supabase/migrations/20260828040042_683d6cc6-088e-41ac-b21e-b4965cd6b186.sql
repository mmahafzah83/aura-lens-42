ALTER TABLE public.authority_voice_profiles ADD COLUMN IF NOT EXISTS marker_style jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.authority_voice_profiles.marker_style IS 'Observed marker habits for this language row: { uses_symbols, symbols[], uses_emoji, emoji[], confidence: observed|assumed }. Empty object = no symbols permitted.';
ALTER TABLE public.authority_voice_profiles
  ADD COLUMN IF NOT EXISTS in_voice_moves TEXT[],
  ADD COLUMN IF NOT EXISTS in_voice_opens TEXT[],
  ADD COLUMN IF NOT EXISTS in_voice_lands TEXT[];
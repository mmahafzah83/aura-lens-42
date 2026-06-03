ALTER TABLE public.authority_voice_profiles
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT true;

UPDATE public.authority_voice_profiles
SET language = 'ar'
WHERE tone ~ '[\u0600-\u06FF]';

UPDATE public.authority_voice_profiles
SET is_primary = true
WHERE is_primary IS DISTINCT FROM true;
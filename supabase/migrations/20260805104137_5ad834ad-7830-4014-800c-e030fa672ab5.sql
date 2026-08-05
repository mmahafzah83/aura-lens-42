ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS default_template text,
  ADD COLUMN IF NOT EXISTS default_theme text;
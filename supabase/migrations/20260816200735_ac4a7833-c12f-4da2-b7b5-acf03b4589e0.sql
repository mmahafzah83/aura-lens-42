ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS consented_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_version text;
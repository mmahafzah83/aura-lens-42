ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS shared_learning_consent boolean NOT NULL DEFAULT false;
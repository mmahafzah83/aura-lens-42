ALTER TABLE public.strategic_signals
  ADD COLUMN IF NOT EXISTS commercial_validation_score double precision DEFAULT NULL;
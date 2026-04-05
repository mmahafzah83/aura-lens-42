
ALTER TABLE public.strategic_signals
  ADD COLUMN IF NOT EXISTS unique_orgs integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS confidence_explanation text,
  ADD COLUMN IF NOT EXISTS what_it_means_for_you text,
  ADD COLUMN IF NOT EXISTS priority_score numeric NOT NULL DEFAULT 0.5;

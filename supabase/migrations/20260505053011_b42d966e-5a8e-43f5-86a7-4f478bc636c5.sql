ALTER TABLE public.strategic_signals
  ADD COLUMN IF NOT EXISTS signal_velocity double precision DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS velocity_status text DEFAULT 'stable',
  ADD COLUMN IF NOT EXISTS last_decay_at timestamptz DEFAULT NULL;

DO $$ BEGIN
  ALTER TABLE public.strategic_signals
    ADD CONSTRAINT strategic_signals_velocity_status_check
    CHECK (velocity_status IN ('accelerating', 'stable', 'fading', 'dormant'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
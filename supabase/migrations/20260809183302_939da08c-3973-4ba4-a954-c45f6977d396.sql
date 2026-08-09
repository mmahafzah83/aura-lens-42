-- One profile per mode, one primary per member. Both were assumed by the
-- loaders and neither was enforced, which is how the duplicate-'default'
-- bug reached a member. mode_key is nullable on legacy rows, so the mode
-- index is partial.
CREATE UNIQUE INDEX IF NOT EXISTS authority_voice_profiles_user_mode_uq
  ON public.authority_voice_profiles (user_id, mode_key)
  WHERE mode_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS authority_voice_profiles_one_primary_uq
  ON public.authority_voice_profiles (user_id)
  WHERE is_primary;

-- A suggested rule is a proposal, not a rule. Only 'active' reaches generation.
ALTER TABLE public.voice_rules
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  ADD COLUMN IF NOT EXISTS suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'voice_rules_status_check'
  ) THEN
    ALTER TABLE public.voice_rules
      ADD CONSTRAINT voice_rules_status_check
      CHECK (status IN ('suggested', 'active', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS voice_rules_user_status_idx
  ON public.voice_rules (user_id, status);
-- mode_key is nullable on legacy rows, so the uniqueness is a partial index.
CREATE UNIQUE INDEX IF NOT EXISTS authority_voice_profiles_user_mode_key
  ON public.authority_voice_profiles (user_id, mode_key)
  WHERE mode_key IS NOT NULL;

-- At most one primary per user; "exactly one" is enforced in code on create/merge/delete.
CREATE UNIQUE INDEX IF NOT EXISTS authority_voice_profiles_one_primary
  ON public.authority_voice_profiles (user_id)
  WHERE is_primary;

ALTER TABLE public.voice_rules
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS evidence jsonb,
  ADD COLUMN IF NOT EXISTS suggested_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

ALTER TABLE public.voice_rules
  DROP CONSTRAINT IF EXISTS voice_rules_status_check;
ALTER TABLE public.voice_rules
  ADD CONSTRAINT voice_rules_status_check
  CHECK (status IN ('suggested', 'active', 'dismissed'));

CREATE INDEX IF NOT EXISTS voice_rules_user_status_idx
  ON public.voice_rules (user_id, status);
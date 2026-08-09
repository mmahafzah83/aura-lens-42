-- One profile per (user, mode). Verified: no duplicate rows exist at this point,
-- so nothing needs merging — the constraint only stops it recurring.
CREATE UNIQUE INDEX IF NOT EXISTS authority_voice_profiles_user_mode_key
  ON public.authority_voice_profiles (user_id, mode_key);
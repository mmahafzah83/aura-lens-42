ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS desk_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.diagnostic_profiles.desk_prefs IS
  'Desk preferences: { priority, audience, watch: {key:bool}, declined: {key:date} }. Follows the notification_prefs precedent on this table.';
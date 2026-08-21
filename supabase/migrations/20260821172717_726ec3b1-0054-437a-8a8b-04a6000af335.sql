ALTER TABLE public.linkedin_profile_snapshots DROP CONSTRAINT IF EXISTS linkedin_profile_snapshots_user_id_key;
DROP INDEX IF EXISTS public.linkedin_profile_snapshots_user_id_key;
UPDATE public.linkedin_profile_snapshots SET created_at = fetched_at WHERE created_at IS DISTINCT FROM fetched_at;
CREATE UNIQUE INDEX IF NOT EXISTS linkedin_profile_snapshots_user_fetched ON public.linkedin_profile_snapshots (user_id, fetched_at);
CREATE INDEX IF NOT EXISTS linkedin_profile_snapshots_user_fetched_desc ON public.linkedin_profile_snapshots (user_id, fetched_at DESC);
DROP INDEX IF EXISTS public.linkedin_profile_snapshots_user_fetched;
CREATE INDEX IF NOT EXISTS linkedin_profile_snapshots_user_fetched ON public.linkedin_profile_snapshots (user_id, fetched_at);
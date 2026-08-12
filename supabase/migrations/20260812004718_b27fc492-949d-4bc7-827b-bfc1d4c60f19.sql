-- 1. Back up before anything destructive.
CREATE TABLE IF NOT EXISTS public.linkedin_connections_guessed_20260812 AS
SELECT * FROM public.linkedin_connections WHERE source_status = 'guessed_from_name';

ALTER TABLE public.linkedin_connections_guessed_20260812 ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.linkedin_connections_guessed_20260812 TO authenticated;
GRANT ALL ON public.linkedin_connections_guessed_20260812 TO service_role;

DROP POLICY IF EXISTS "Admins can read guessed backup" ON public.linkedin_connections_guessed_20260812;
CREATE POLICY "Admins can read guessed backup"
  ON public.linkedin_connections_guessed_20260812
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- 2. Clear the invented addresses. Tokens and identity are untouched.
UPDATE public.linkedin_connections
   SET handle = NULL,
       profile_url = NULL,
       profile_name = NULL,
       source_status = 'missing',
       updated_at = now()
 WHERE source_status = 'guessed_from_name';

-- 3. A validation rule, not a cleaning rule: an address that does not look
-- like a LinkedIn vanity name is rejected outright. Display names carry
-- commas, spaces, dots, Arabic script and trademark signs; vanity names never do.
ALTER TABLE public.linkedin_connections
  DROP CONSTRAINT IF EXISTS linkedin_connections_handle_is_vanity;
ALTER TABLE public.linkedin_connections
  ADD CONSTRAINT linkedin_connections_handle_is_vanity
  CHECK (handle IS NULL OR handle ~ '^[A-Za-z0-9][A-Za-z0-9-]{1,99}$');
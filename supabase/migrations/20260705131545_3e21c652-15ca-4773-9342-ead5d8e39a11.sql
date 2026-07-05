
-- 1. Lock is_admin column on diagnostic_profiles from client updates
DROP TRIGGER IF EXISTS lock_is_admin_column_trigger ON public.diagnostic_profiles;
CREATE TRIGGER lock_is_admin_column_trigger
  BEFORE UPDATE ON public.diagnostic_profiles
  FOR EACH ROW EXECUTE FUNCTION public.lock_is_admin_column();

-- Also block INSERT with is_admin=true from JWT callers
CREATE OR REPLACE FUNCTION public.block_is_admin_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS TRUE
     AND current_setting('request.jwt.claims', true) IS NOT NULL THEN
    NEW.is_admin := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS block_is_admin_insert_trigger ON public.diagnostic_profiles;
CREATE TRIGGER block_is_admin_insert_trigger
  BEFORE INSERT ON public.diagnostic_profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_is_admin_insert();

-- 2. guide_slug_misses: remove permissive INSERT/UPDATE, expose SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Authenticated can insert misses" ON public.guide_slug_misses;
DROP POLICY IF EXISTS "Authenticated can update misses" ON public.guide_slug_misses;

CREATE OR REPLACE FUNCTION public.record_guide_miss(_slug text, _surface text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _slug IS NULL OR length(_slug) = 0 OR length(_slug) > 200 THEN RETURN; END IF;
  IF _surface NOT IN ('tooltip','hint') THEN RETURN; END IF;
  INSERT INTO public.guide_slug_misses (slug, surface, count, first_seen, last_seen)
  VALUES (_slug, _surface, 1, now(), now())
  ON CONFLICT (slug, surface)
  DO UPDATE SET count = public.guide_slug_misses.count + 1, last_seen = now();
END;
$$;
REVOKE ALL ON FUNCTION public.record_guide_miss(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_guide_miss(text, text) TO authenticated;

-- 3. linkedin_connections: remove client-facing SELECT; expose scoped safe view instead
DROP POLICY IF EXISTS "Users can view own linkedin connection" ON public.linkedin_connections;

DROP VIEW IF EXISTS public.linkedin_connections_safe;
CREATE VIEW public.linkedin_connections_safe
WITH (security_barrier = true, security_invoker = false) AS
SELECT
  id, user_id, linkedin_id, display_name, handle, profile_name, profile_url,
  status, source_status, timezone, scopes,
  connected_at, last_synced_at, token_expires_at, created_at, updated_at
FROM public.linkedin_connections
WHERE user_id = auth.uid();

GRANT SELECT ON public.linkedin_connections_safe TO authenticated;

-- 4. linkedin_connections: add claim_token_hash so linkedin-claim can verify caller
ALTER TABLE public.linkedin_connections
  ADD COLUMN IF NOT EXISTS claim_token_hash text;

-- 5. strategic_signals_lifecycle_backup_20260531: document intentional lockdown, revoke grants
REVOKE ALL ON public.strategic_signals_lifecycle_backup_20260531 FROM anon, authenticated;
GRANT ALL ON public.strategic_signals_lifecycle_backup_20260531 TO service_role;
COMMENT ON TABLE public.strategic_signals_lifecycle_backup_20260531 IS
  'Frozen point-in-time backup. Intentionally inaccessible via PostgREST; only service_role may read.';

-- 1. Fix linkedin_connections: revoke direct SELECT, create a secure view excluding tokens
-- Drop the existing permissive SELECT policy
DROP POLICY IF EXISTS "Users can view own linkedin connection" ON public.linkedin_connections;

-- Create a restrictive SELECT policy that blocks client access to token columns
-- We use a security definer function + view approach
CREATE OR REPLACE VIEW public.linkedin_connections_safe AS
SELECT
  id, user_id, linkedin_id, display_name, handle, profile_name, profile_url,
  status, source_status, timezone, scopes, connected_at, last_synced_at,
  token_expires_at, created_at, updated_at
FROM public.linkedin_connections;

-- Re-add SELECT policy but only via RLS (edge functions use service role key so unaffected)
CREATE POLICY "Users can view own linkedin connection"
ON public.linkedin_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Revoke direct SELECT on sensitive columns from anon and authenticated roles
-- This ensures tokens can't be read even through the policy
REVOKE SELECT (access_token, refresh_token) ON public.linkedin_connections FROM anon, authenticated;

-- 2. Fix capture-images storage INSERT policy
DROP POLICY IF EXISTS "Users can upload capture images" ON storage.objects;
CREATE POLICY "Users can upload capture images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'capture-images'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 3. Add missing UPDATE policy on influence_snapshots
CREATE POLICY "Users can update own snapshots"
ON public.influence_snapshots
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
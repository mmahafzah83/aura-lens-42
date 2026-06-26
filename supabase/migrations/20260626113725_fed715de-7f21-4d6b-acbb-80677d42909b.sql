
-- 1) Restrict LinkedIn OAuth token columns from the client.
-- The view linkedin_connections_safe (security_invoker=true) already excludes
-- access_token and refresh_token. We revoke broad column SELECT on the base
-- table and re-grant SELECT only on the non-sensitive columns. Edge functions
-- using the service_role bypass RLS/column grants.
REVOKE SELECT ON public.linkedin_connections FROM authenticated;
REVOKE SELECT ON public.linkedin_connections FROM anon;

GRANT SELECT (
  id, user_id, linkedin_id, display_name, handle, profile_name, profile_url,
  status, source_status, timezone, scopes, connected_at, last_synced_at,
  token_expires_at, created_at, updated_at
) ON public.linkedin_connections TO authenticated;

-- Keep write privileges (RLS still scopes them to the owner).
GRANT INSERT, UPDATE, DELETE ON public.linkedin_connections TO authenticated;
GRANT ALL ON public.linkedin_connections TO service_role;

-- 2) audience_demographics: add the missing UPDATE policy so owners can edit.
CREATE POLICY "Users can update own demographics"
ON public.audience_demographics
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

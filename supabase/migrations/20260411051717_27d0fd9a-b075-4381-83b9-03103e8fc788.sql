-- Fix the view to use SECURITY INVOKER
DROP VIEW IF EXISTS public.linkedin_connections_safe;
CREATE VIEW public.linkedin_connections_safe
WITH (security_invoker = true) AS
SELECT
  id, user_id, linkedin_id, display_name, handle, profile_name, profile_url,
  status, source_status, timezone, scopes, connected_at, last_synced_at,
  token_expires_at, created_at, updated_at
FROM public.linkedin_connections;
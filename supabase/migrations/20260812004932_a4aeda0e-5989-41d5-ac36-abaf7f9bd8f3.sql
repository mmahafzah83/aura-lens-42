-- These four views read tables whose row level security already scopes rows to
-- the owner. Running them as the creator (SECURITY DEFINER, the Postgres default
-- for views) bypasses that. Run them as the caller instead.
ALTER VIEW public.unified_content SET (security_invoker = true);
ALTER VIEW public.influence_timeline SET (security_invoker = true);
ALTER VIEW public.influence_dashboard_view SET (security_invoker = true);
ALTER VIEW public.post_provenance SET (security_invoker = true);

-- linkedin_connections_safe, daily_brief_latest and morning_promise_state stay
-- as creator-rights views on purpose: they read tables the member has no direct
-- read grant on (tokens, admin logs) and do their own filtering.
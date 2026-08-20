CREATE OR REPLACE FUNCTION public.posts_attribution()
RETURNS TABLE(total bigint, member bigint, aura bigint, machine bigint, unknown bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*),
    count(*) FILTER (WHERE made_by IN ('member','aura_edited_by_member')),
    count(*) FILTER (WHERE made_by = 'aura'),
    count(*) FILTER (WHERE made_by = 'machine'),
    count(*) FILTER (WHERE made_by = 'unknown')
  FROM public.linkedin_posts
  WHERE public.is_current_user_admin();
$$;

REVOKE ALL ON FUNCTION public.posts_attribution() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.posts_attribution() TO authenticated, service_role;
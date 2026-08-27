-- Normalise a raw LinkedIn address into a bare vanity handle.
CREATE OR REPLACE FUNCTION public.normalise_linkedin_handle(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    lower(
      trim(both '/' from
        regexp_replace(
          regexp_replace(
            regexp_replace(coalesce(p_raw, ''), '^\s*@+', ''),
            '^\s*(https?://)?([a-z0-9-]+\.)*linkedin\.com/in/', '', 'i'
          ),
          '[/?#].*$', ''
        )
      )
    ),
    ''
  );
$$;

-- Read-time resolver: profile first, then the member's LinkedIn connection,
-- then the identity register.
CREATE OR REPLACE FUNCTION public.resolve_member_handle(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    public.normalise_linkedin_handle((SELECT p.linkedin_handle FROM public.diagnostic_profiles p WHERE p.user_id = p_user_id)),
    public.normalise_linkedin_handle((SELECT r.handle FROM public.linkedin_read_readiness r WHERE r.user_id = p_user_id)),
    public.normalise_linkedin_handle((SELECT i.linkedin_handle FROM public.identity_registry i WHERE i.user_id = p_user_id))
  );
$$;

GRANT EXECUTE ON FUNCTION public.normalise_linkedin_handle(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_member_handle(uuid) TO authenticated, service_role;

-- Backfill. Members with no address in any store are left untouched.
UPDATE public.diagnostic_profiles p
SET linkedin_handle = v.h,
    linkedin_url    = 'https://www.linkedin.com/in/' || v.h
FROM (
  SELECT p2.user_id,
         COALESCE(
           public.normalise_linkedin_handle(p2.linkedin_handle),
           public.normalise_linkedin_handle((SELECT r.handle FROM public.linkedin_read_readiness r WHERE r.user_id = p2.user_id)),
           public.normalise_linkedin_handle((SELECT i.linkedin_handle FROM public.identity_registry i WHERE i.user_id = p2.user_id))
         ) AS h
  FROM public.diagnostic_profiles p2
) v
WHERE v.user_id = p.user_id
  AND v.h IS NOT NULL;
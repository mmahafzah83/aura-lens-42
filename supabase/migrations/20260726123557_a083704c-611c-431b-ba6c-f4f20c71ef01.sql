CREATE OR REPLACE FUNCTION public.founder_brief_verify()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  founder uuid := '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3';
  ru uuid[];
  res jsonb;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT array_agg(id) INTO ru FROM auth.users u
   WHERE u.id <> founder AND coalesce(u.email,'') NOT ILIKE '%test%';
  ru := coalesce(ru, ARRAY[]::uuid[]);

  -- Route C: every number re-derived per user with EXISTS, then summed.
  SELECT jsonb_build_object(
    'checked_at', now(),
    'invited', (SELECT count(*) FROM auth.users u WHERE u.id = ANY(ru)),
    'signed_in', (SELECT count(*) FROM auth.users u WHERE u.id = ANY(ru) AND u.last_sign_in_at IS NOT NULL),
    'finished_setup', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM diagnostic_profiles d WHERE d.user_id = x)),
    'captured', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM entries e WHERE e.user_id = x)),
    'got_signal', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM strategic_signals s WHERE s.user_id = x)),
    'linkedin_live', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM linkedin_connections l WHERE l.user_id = x AND l.status='active')),
    'opened_writer', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM product_events p WHERE p.user_id = x AND p.event='composer_opened')),
    'has_draft', (SELECT count(*) FROM unnest(ru) x WHERE
        EXISTS(SELECT 1 FROM content_items c WHERE c.user_id = x AND c.status='draft')
        OR EXISTS(SELECT 1 FROM linkedin_posts l WHERE l.user_id = x AND l.tracking_status='draft' AND l.source_type IN ('aura_generated','carousel_studio'))),
    'published', (SELECT count(*) FROM unnest(ru) x WHERE EXISTS(SELECT 1 FROM linkedin_posts l WHERE l.user_id = x AND l.tracking_status='published')),
    'drafts_total', (SELECT (SELECT count(*) FROM content_items c WHERE c.user_id = ANY(ru) AND c.status='draft')
                          + (SELECT count(*) FROM linkedin_posts l WHERE l.user_id = ANY(ru) AND l.tracking_status='draft' AND l.source_type IN ('aura_generated','carousel_studio'))),
    'failed_publishes', (SELECT count(*) FROM linkedin_posts l WHERE l.user_id = ANY(ru) AND l.tracking_status='failed'),
    'signal_engagement_rows', (SELECT count(*) FROM signal_engagements WHERE user_id = ANY(ru))
  ) INTO res;

  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.founder_brief_verify() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.founder_brief_verify() TO authenticated;
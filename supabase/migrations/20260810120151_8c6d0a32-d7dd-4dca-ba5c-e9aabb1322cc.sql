-- 1. ROLES ------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'member'::app_role FROM public.diagnostic_profiles
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_member_role_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.user_id, 'member'::app_role)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_member_role_on_profile_trigger ON public.diagnostic_profiles;
CREATE TRIGGER grant_member_role_on_profile_trigger
AFTER INSERT ON public.diagnostic_profiles
FOR EACH ROW EXECUTE FUNCTION public.grant_member_role_on_profile();

-- 2. KILL THE SECOND ADMIN DOOR ----------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

DROP FUNCTION IF EXISTS public.lock_is_admin_column() CASCADE;
DROP FUNCTION IF EXISTS public.block_is_admin_insert() CASCADE;

ALTER TABLE public.diagnostic_profiles DROP COLUMN IF EXISTS is_admin;

-- 3. ONE DEFINITION OF "MADE WITH AURA" --------------------------------------
ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

UPDATE public.diagnostic_profiles
SET is_internal = true
WHERE user_id = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3';

CREATE OR REPLACE VIEW public.aura_output AS
SELECT user_id, id AS post_id
FROM public.linkedin_posts
WHERE source_type IN ('aura_generated','carousel_studio')
  AND tracking_status IN ('published','confirmed','indexed_late');

GRANT SELECT ON public.aura_output TO authenticated;
GRANT ALL ON public.aura_output TO service_role;

DROP VIEW IF EXISTS public.cockpit_members CASCADE;

CREATE VIEW public.cockpit_members AS
 SELECT p.user_id,
    p.first_name,
    p.created_at::date AS joined_on,
    now()::date - p.created_at::date AS day_n,
    COALESCE(e.captures, 0::bigint) AS captures,
    e.last_capture,
    COALESCE(s.signals, 0::bigint) AS signals,
    COALESCE(l.through_aura, 0::bigint) AS posts_through_aura,
    COALESCE(r.read_posts, 0::bigint) AS posts_read,
    COALESCE(m.emails, 0::bigint) AS lifecycle_emails,
        CASE
            WHEN COALESCE(l.through_aura, 0::bigint) >= 3 THEN 'shipping'::text
            WHEN COALESCE(l.through_aura, 0::bigint) >= 1 THEN 'started'::text
            WHEN COALESCE(e.captures, 0::bigint) >= 1 THEN 'drawer'::text
            ELSE 'cold'::text
        END AS state,
    e.last_capture >= (now()::date - 7) AS active_7d,
    COALESCE(v.primary_language, 'en'::text) AS primary_language,
    v.voice_refreshed_at,
    COALESCE(c.posts_with_text, 0::bigint) AS posts_with_text,
    COALESCE(c.posts_with_text_primary_lang, 0::bigint) AS posts_with_text_primary_lang,
    c.newest_post_with_text
   FROM public.diagnostic_profiles p
     LEFT JOIN LATERAL ( SELECT count(*) AS captures,
            max(entries.created_at)::date AS last_capture
           FROM public.entries
          WHERE entries.user_id = p.user_id) e ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS signals
           FROM public.strategic_signals
          WHERE strategic_signals.user_id = p.user_id) s ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS through_aura
           FROM public.aura_output ao
          WHERE ao.user_id = p.user_id) l ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS read_posts
           FROM public.linkedin_posts rp
          WHERE rp.user_id = p.user_id
            AND rp.source_type = ANY (ARRAY['search_discovery'::text,'imported'::text,'linkedin_export'::text])) r ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS emails
           FROM public.lifecycle_email_log
          WHERE lifecycle_email_log.user_id = p.user_id) m ON true
     LEFT JOIN LATERAL ( SELECT avp.language AS primary_language,
            max(avp2.updated_at) AS voice_refreshed_at
           FROM public.authority_voice_profiles avp
             LEFT JOIN public.authority_voice_profiles avp2 ON avp2.user_id = p.user_id
          WHERE avp.user_id = p.user_id
          GROUP BY avp.language, avp.is_primary, avp.updated_at
          ORDER BY avp.is_primary DESC NULLS LAST, avp.updated_at DESC
         LIMIT 1) v ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS posts_with_text,
            count(*) FILTER (WHERE (COALESCE(v.primary_language, 'en'::text) = 'ar'::text) = (lp.post_text ~ '[\u0600-\u06FF]'::text)) AS posts_with_text_primary_lang,
            max(COALESCE(lp.published_at, lp.synced_at, lp.created_at))::date AS newest_post_with_text
           FROM public.linkedin_posts lp
          WHERE lp.user_id = p.user_id AND lp.post_text IS NOT NULL AND length(btrim(lp.post_text)) > 0 AND (lp.source_type = ANY (ARRAY['linkedin_export'::text, 'linkedin_own'::text, 'aura_generated'::text, 'carousel_studio'::text]))) c ON true
  WHERE NOT p.is_internal;

GRANT ALL ON public.cockpit_members TO service_role;

-- dependents recreated unchanged
CREATE OR REPLACE VIEW public.cockpit_pulse AS
 SELECT now() AS as_of,
    ( SELECT count(*) AS count FROM cockpit_members) AS members,
    ( SELECT count(*) FILTER (WHERE cockpit_members.active_7d) AS count FROM cockpit_members) AS active_7d,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'shipping'::text) AS count FROM cockpit_members) AS shipping,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'started'::text) AS count FROM cockpit_members) AS started,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'drawer'::text) AS count FROM cockpit_members) AS drawer,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'cold'::text) AS count FROM cockpit_members) AS cold,
    ( SELECT COALESCE(sum(cockpit_members.captures), 0::numeric) AS "coalesce" FROM cockpit_members) AS captures_total,
    ( SELECT count(*) AS count FROM entries WHERE entries.user_id <> founder_uuid() AND entries.created_at > (now() - '7 days'::interval)) AS captures_7d,
    ( SELECT count(*) AS count FROM linkedin_posts WHERE linkedin_posts.user_id <> founder_uuid()) AS posts_total,
    ( SELECT COALESCE(sum(cockpit_members.posts_through_aura), 0::numeric) AS "coalesce" FROM cockpit_members) AS posts_through_aura,
    ( SELECT count(*) AS count FROM lifecycle_email_log WHERE lifecycle_email_log.sent_at > (now() - '7 days'::interval)) AS emails_7d,
    ( SELECT count(*) AS count FROM ef_faults WHERE ef_faults.created_at > (now() - '48:00:00'::interval)) AS faults_48h,
    ( SELECT count(*) AS count FROM health_findings WHERE health_findings.resolved_at IS NULL) AS health_open;

GRANT SELECT ON public.cockpit_pulse TO anon, authenticated;
GRANT ALL ON public.cockpit_pulse TO service_role;

CREATE OR REPLACE VIEW public.cockpit_assertions AS
 WITH a(claim, ok, detail) AS (
         SELECT 'briefs_sent_today'::text,
            (EXISTS ( SELECT 1 FROM daily_brief_snapshots
                  WHERE daily_brief_snapshots.created_at > (now() - '26:00:00'::interval) AND daily_brief_snapshots.is_sent)),
            'founder-daily-brief must actually send, not merely run'::text
        UNION ALL
         SELECT 'no_silent_member'::text,
            NOT (EXISTS ( SELECT 1 FROM cockpit_members
                  WHERE cockpit_members.captures >= 3 AND cockpit_members.posts_through_aura = 0 AND cockpit_members.day_n >= 14)),
            'a member 14 days in with 3+ captures and 0 published is the core leak'::text
        UNION ALL
         SELECT 'faults_under_control'::text,
            (( SELECT count(*) AS count FROM ef_faults WHERE ef_faults.created_at > (now() - '24:00:00'::interval))) < 20,
            'real faults under 20/day'::text
        UNION ALL
         SELECT 'every_member_has_signals'::text,
            NOT (EXISTS ( SELECT 1 FROM cockpit_members
                  WHERE cockpit_members.captures >= 2 AND cockpit_members.signals = 0)),
            'captures must convert into signals'::text
        UNION ALL
         SELECT 'voice_corpus_healthy'::text,
            NOT (EXISTS ( SELECT 1 FROM cockpit_members
                  WHERE cockpit_members.posts_with_text_primary_lang < 5)),
            'every member needs at least 5 of their own posts with text in their main language for the voice to sound like them'::text
        )
 SELECT claim, ok, detail,
        CASE WHEN ok THEN 'pass'::text ELSE 'FAIL'::text END AS status
   FROM a;

GRANT SELECT ON public.cockpit_assertions TO anon, authenticated;
GRANT ALL ON public.cockpit_assertions TO service_role;
CREATE OR REPLACE VIEW public.cockpit_members
 WITH (security_invoker='true') AS
 SELECT p.user_id,
    p.first_name,
    p.created_at::date AS joined_on,
    now()::date - p.created_at::date AS day_n,
    COALESCE(e.captures, 0::bigint) AS captures,
    e.last_capture,
    COALESCE(s.signals, 0::bigint) AS signals,
    COALESCE(l.through_aura, 0::bigint) AS posts_through_aura,
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
   FROM diagnostic_profiles p
     LEFT JOIN LATERAL ( SELECT count(*) AS captures,
            max(entries.created_at)::date AS last_capture
           FROM entries
          WHERE entries.user_id = p.user_id) e ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS signals
           FROM strategic_signals
          WHERE strategic_signals.user_id = p.user_id) s ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS through_aura
           FROM linkedin_posts
          WHERE linkedin_posts.user_id = p.user_id AND (linkedin_posts.tracking_status = ANY (ARRAY['confirmed'::text, 'indexed_late'::text]))) l ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS emails
           FROM lifecycle_email_log
          WHERE lifecycle_email_log.user_id = p.user_id) m ON true
     LEFT JOIN LATERAL ( SELECT avp.language AS primary_language,
            max(avp2.updated_at) AS voice_refreshed_at
           FROM authority_voice_profiles avp
             LEFT JOIN authority_voice_profiles avp2 ON avp2.user_id = p.user_id
          WHERE avp.user_id = p.user_id
          GROUP BY avp.language, avp.is_primary, avp.updated_at
          ORDER BY avp.is_primary DESC NULLS LAST, avp.updated_at DESC
          LIMIT 1) v ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS posts_with_text,
            count(*) FILTER (
              WHERE (COALESCE(v.primary_language, 'en') = 'ar') = (lp.post_text ~ '[\u0600-\u06FF]')
            ) AS posts_with_text_primary_lang,
            max(lp.published_at)::date AS newest_post_with_text
           FROM linkedin_posts lp
          WHERE lp.user_id = p.user_id
            AND lp.post_text IS NOT NULL
            AND length(btrim(lp.post_text)) > 0
            AND lp.source_type = ANY (ARRAY['linkedin_export'::text, 'linkedin_own'::text, 'aura_generated'::text, 'carousel_studio'::text])) c ON true
  WHERE p.user_id <> founder_uuid();

CREATE OR REPLACE VIEW public.cockpit_assertions
 WITH (security_invoker='true') AS
 WITH a(claim, ok, detail) AS (
         SELECT 'briefs_sent_today'::text,
            (EXISTS ( SELECT 1
                   FROM daily_brief_snapshots
                  WHERE daily_brief_snapshots.created_at > (now() - '26:00:00'::interval) AND daily_brief_snapshots.is_sent)),
            'founder-daily-brief must actually send, not merely run'::text
        UNION ALL
         SELECT 'no_silent_member'::text,
            NOT (EXISTS ( SELECT 1
                   FROM cockpit_members
                  WHERE cockpit_members.captures >= 3 AND cockpit_members.posts_through_aura = 0 AND cockpit_members.day_n >= 14)),
            'a member 14 days in with 3+ captures and 0 published is the core leak'::text
        UNION ALL
         SELECT 'faults_under_control'::text,
            (( SELECT count(*) AS count
                   FROM ef_faults
                  WHERE ef_faults.created_at > (now() - '24:00:00'::interval))) < 20,
            'real faults under 20/day'::text
        UNION ALL
         SELECT 'every_member_has_signals'::text,
            NOT (EXISTS ( SELECT 1
                   FROM cockpit_members
                  WHERE cockpit_members.captures >= 2 AND cockpit_members.signals = 0)),
            'captures must convert into signals'::text
        UNION ALL
         SELECT 'voice_corpus_healthy'::text,
            NOT (EXISTS ( SELECT 1
                   FROM cockpit_members
                  WHERE cockpit_members.posts_with_text_primary_lang < 5)),
            'every member needs at least 5 of their own posts with text in their main language for the voice to sound like them'::text
        )
 SELECT claim,
    ok,
    detail,
        CASE
            WHEN ok THEN 'pass'::text
            ELSE 'FAIL'::text
        END AS status
   FROM a;
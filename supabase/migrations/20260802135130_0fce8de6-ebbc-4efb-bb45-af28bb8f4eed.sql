CREATE OR REPLACE VIEW public.cockpit_members AS
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
            count(*) FILTER (WHERE (COALESCE(v.primary_language, 'en'::text) = 'ar'::text) = (lp.post_text ~ '[\u0600-\u06FF]'::text)) AS posts_with_text_primary_lang,
            max(COALESCE(lp.published_at, lp.synced_at, lp.created_at))::date AS newest_post_with_text
           FROM linkedin_posts lp
          WHERE lp.user_id = p.user_id AND lp.post_text IS NOT NULL AND length(btrim(lp.post_text)) > 0 AND (lp.source_type = ANY (ARRAY['linkedin_export'::text, 'linkedin_own'::text, 'aura_generated'::text, 'carousel_studio'::text]))) c ON true
  WHERE p.user_id <> founder_uuid();
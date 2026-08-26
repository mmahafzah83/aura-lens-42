DROP VIEW IF EXISTS public.cockpit_assertions;
DROP VIEW IF EXISTS public.cockpit_pulse;
DROP VIEW IF EXISTS public.cockpit_members;
DROP VIEW IF EXISTS public.member_accounts;

ALTER TABLE public.diagnostic_profiles DROP COLUMN IF EXISTS signature_presets;

CREATE VIEW public.member_accounts WITH (security_invoker = on) AS
SELECT id, user_id, firm, level, core_practice, sector_focus, north_star_goal,
    years_experience, leadership_style, generated_skills, skill_ratings, completed,
    created_at, brand_pillars, last_active_at, identity_intelligence, last_visit_at,
    first_name, onboarding_completed, primary_strength, audit_results,
    audit_interpretation, audit_completed_at, brand_assessment_answers,
    brand_assessment_results, brand_assessment_completed_at, avatar_url,
    phone_whatsapp, phone_verified, notification_prefs, linkedin_url, last_name,
    theme_preference, linkedin_handle, onboarding_step, audit_method,
    shared_learning_consent, lifecycle_opt_out, country, country_code,
    aura_card_ready_at, content_language, target_register, ui_dismissals,
    avatar_cutout_url, display_name_override, default_template, default_theme,
    timezone, account_type, excluded_reason, excluded_at
   FROM public.diagnostic_profiles
  WHERE account_type = 'customer'::account_type;

CREATE VIEW public.cockpit_members WITH (security_invoker = on) AS
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
   FROM member_accounts p
     LEFT JOIN LATERAL ( SELECT count(*) AS captures,
            max(entries.created_at)::date AS last_capture
           FROM entries
          WHERE entries.user_id = p.user_id) e ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS signals
           FROM strategic_signals
          WHERE strategic_signals.user_id = p.user_id) s ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS through_aura
           FROM aura_output ao
          WHERE ao.user_id = p.user_id) l ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS read_posts
           FROM linkedin_posts rp
          WHERE rp.user_id = p.user_id AND (rp.source_type = ANY (ARRAY['search_discovery'::text, 'imported'::text, 'linkedin_export'::text]))) r ON true
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
          WHERE lp.user_id = p.user_id AND lp.post_text IS NOT NULL AND length(btrim(lp.post_text)) > 0 AND (lp.source_type = ANY (ARRAY['linkedin_export'::text, 'linkedin_own'::text, 'aura_generated'::text, 'carousel_studio'::text]))) c ON true;

CREATE VIEW public.cockpit_pulse WITH (security_invoker = on) AS
 SELECT now() AS as_of,
    ( SELECT count(*) AS count
           FROM cockpit_members) AS members,
    ( SELECT count(*) FILTER (WHERE cockpit_members.active_7d) AS count
           FROM cockpit_members) AS active_7d,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'shipping'::text) AS count
           FROM cockpit_members) AS shipping,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'started'::text) AS count
           FROM cockpit_members) AS started,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'drawer'::text) AS count
           FROM cockpit_members) AS drawer,
    ( SELECT count(*) FILTER (WHERE cockpit_members.state = 'cold'::text) AS count
           FROM cockpit_members) AS cold,
    ( SELECT COALESCE(sum(cockpit_members.captures), 0::numeric) AS "coalesce"
           FROM cockpit_members) AS captures_total,
    ( SELECT count(*) AS count
           FROM entries
          WHERE (entries.user_id IN ( SELECT ma.user_id
                   FROM member_accounts ma)) AND entries.created_at > (now() - '7 days'::interval)) AS captures_7d,
    ( SELECT count(*) AS count
           FROM linkedin_posts
          WHERE (linkedin_posts.user_id IN ( SELECT ma.user_id
                   FROM member_accounts ma))) AS posts_total,
    ( SELECT COALESCE(sum(cockpit_members.posts_through_aura), 0::numeric) AS "coalesce"
           FROM cockpit_members) AS posts_through_aura,
    ( SELECT count(*) AS count
           FROM lifecycle_email_log
          WHERE (lifecycle_email_log.user_id IN ( SELECT ma.user_id
                   FROM member_accounts ma)) AND lifecycle_email_log.sent_at > (now() - '7 days'::interval)) AS emails_7d,
    ( SELECT count(*) AS count
           FROM ef_faults
          WHERE ef_faults.created_at > (now() - '48:00:00'::interval)) AS faults_48h,
    ( SELECT count(*) AS count
           FROM health_findings
          WHERE health_findings.resolved_at IS NULL) AS health_open;

CREATE VIEW public.cockpit_assertions AS
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
            'every member needs at least 5 of their own posts with text in their main language'::text
        UNION ALL
         SELECT 'no_placeholder_reports'::text,
            NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles
                  WHERE diagnostic_profiles.account_type = 'customer'::account_type AND diagnostic_profiles.brand_assessment_results::text ~ '\[[A-Za-z][^]["]{1,38}\]'::text)),
            'Law #71 — a saved report must never contain a bracketed placeholder'::text
        UNION ALL
         SELECT 'linkedin_addresses_are_confirmed'::text,
            NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles p
                     JOIN linkedin_connections c ON c.user_id = p.user_id
                  WHERE p.account_type = 'customer'::account_type AND COALESCE(c.source_status, ''::text) <> 'verified_by_read'::text)),
            'Law #78 — only a successful read confirms an address'::text
        UNION ALL
         SELECT 'every_customer_is_banded'::text,
            NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles
                  WHERE diagnostic_profiles.account_type = 'customer'::account_type AND diagnostic_profiles.onboarding_completed AND diagnostic_profiles.seniority_band IS NULL)),
            'a member past onboarding must have a seniority band'::text
        UNION ALL
         SELECT 'question_banks_complete'::text,
            (( SELECT count(*) AS count
                   FROM onboarding_questions
                  WHERE onboarding_questions.sector IS NULL AND onboarding_questions.active)) = 27 AND (( SELECT count(*) AS count
                   FROM capability_dimensions
                  WHERE capability_dimensions.sector IS NULL AND capability_dimensions.active)) = 24,
            'every band must have its 9 questions and 8 dimensions'::text
        UNION ALL
         SELECT 'report_written_from_evidence'::text,
            NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles p
                  WHERE p.account_type = 'customer'::account_type AND p.brand_assessment_results IS NOT NULL AND NOT (EXISTS ( SELECT 1
                           FROM evidence_fragments f
                          WHERE f.user_id = p.user_id)) AND NOT (EXISTS ( SELECT 1
                           FROM linkedin_profile_snapshots s
                          WHERE s.user_id = p.user_id)))),
            'Law #70 — the screen claims LinkedIn and captures; it must not be written from neither'::text
        UNION ALL
         SELECT 'morning_promise_is_kept'::text,
            ( SELECT morning_promise_state.may_promise
                   FROM morning_promise_state),
            'Law #79 — the product may only promise what the system actually does.'::text
        UNION ALL
         SELECT 'members_can_be_reached'::text,
            NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles
                  WHERE diagnostic_profiles.account_type = 'customer'::account_type AND diagnostic_profiles.onboarding_completed AND diagnostic_profiles.timezone IS NULL)),
            'a member promised a morning brief must have a timezone'::text
        UNION ALL
         SELECT 'capture_read_inside_wait_window'::text,
            NOT (EXISTS ( SELECT 1
                   FROM source_registry r
                     JOIN diagnostic_profiles p ON p.user_id = r.user_id
                  WHERE p.account_type = 'customer'::account_type AND r.created_at > (now() - '7 days'::interval) AND (r.processed_at IS NULL OR EXTRACT(epoch FROM r.processed_at - r.created_at) > 100::numeric))),
            'Law #80 — the client waits 120s for claims. Any capture slower than 100s, or never processed, strands a member on the reading screen.'::text
        UNION ALL
         SELECT 'writes_land_where_intended'::text,
            NOT (EXISTS ( SELECT 1
                   FROM lifecycle_emails e
                  WHERE e.sent_at > (now() - '30 days'::interval) AND e.metadata ? 'message_key'::text AND NOT (EXISTS ( SELECT 1
                           FROM lifecycle_email_log l
                          WHERE l.user_id = e.user_id AND l.message_key = (e.metadata ->> 'message_key'::text))))),
            'Law #84 — a write that affects zero rows is invisible. Every lifecycle email we recorded as sent in the last 30 days must have its dedupe key in lifecycle_email_log; a lost key means the same member can be emailed again tomorrow. Unit is the send, and only sends that carry a message_key are counted.'::text
        UNION ALL
         SELECT 'composer_contract_held'::text,
            NOT (EXISTS ( SELECT 1
                   FROM output_leak_log
                  WHERE output_leak_log.created_at > GREATEST(now() - '7 days'::interval, '2026-08-25 18:56:00+00'::timestamp with time zone))),
            'Law #85 — any contract violation since the contract shipped is a red light'::text
        UNION ALL
         SELECT 'composer_language_parity'::text,
            (( SELECT count(DISTINCT
                        CASE
                            WHEN ((operation_runs.meta -> 'result'::text) ->> 'content'::text) ~ '[؀-ۿ]'::text THEN 'ar'::text
                            ELSE 'en'::text
                        END) AS count
                   FROM operation_runs
                  WHERE operation_runs.operation = 'studio_generate'::text AND operation_runs.started_at > (now() - '7 days'::interval))) = 2,
            'Law #85 — a week where only one language was exercised is a week the other was not verified'::text
        UNION ALL
         SELECT 'composer_never_orders_impossible_number'::text,
            NOT (EXISTS ( SELECT 1
                   FROM operation_runs
                  WHERE operation_runs.operation = 'studio_generate'::text AND operation_runs.started_at > (now() - '7 days'::interval) AND ((operation_runs.meta -> 'result'::text) ->> 'evidence_has_number'::text) = 'false'::text AND ((operation_runs.meta -> 'result'::text) ->> 'requested_ending'::text) = 'number'::text)),
            'Law #86 — a close that demands a figure, drawn against digit-free evidence, cannot be satisfied'::text
        UNION ALL
         SELECT 'composer_guard_ran_last'::text,
            NOT (EXISTS ( SELECT 1
                   FROM operation_runs
                  WHERE operation_runs.operation = 'studio_generate'::text AND operation_runs.started_at > (now() - '7 days'::interval) AND ((operation_runs.meta -> 'result'::text) ->> 'guarded_after_rotation'::text) = 'false'::text)),
            'Law #86 — a rewrite after the provenance guard is unguarded text'::text
        )
 SELECT claim,
    ok,
    detail,
        CASE
            WHEN ok THEN 'pass'::text
            ELSE 'FAIL'::text
        END AS status
   FROM a;
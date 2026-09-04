-- 05 — views.
CREATE OR REPLACE VIEW public.aura_output AS
 SELECT user_id,
    id AS post_id
   FROM linkedin_posts
  WHERE ((source_type = ANY (ARRAY['aura_generated'::text, 'carousel_studio'::text])) AND (tracking_status = ANY (ARRAY['published'::text, 'confirmed'::text, 'indexed_late'::text])));
CREATE OR REPLACE VIEW public.cockpit_assertions AS
 WITH a(claim, ok, detail) AS (
         SELECT 'briefs_sent_today'::text AS text,
            (EXISTS ( SELECT 1
                   FROM daily_brief_snapshots
                  WHERE ((daily_brief_snapshots.created_at > (now() - '26:00:00'::interval)) AND daily_brief_snapshots.is_sent))) AS "exists",
            'founder-daily-brief must actually send, not merely run'::text AS text
        UNION ALL
         SELECT 'no_silent_member'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM cockpit_members
                  WHERE ((cockpit_members.captures >= 3) AND (cockpit_members.posts_through_aura = 0) AND (cockpit_members.day_n >= 14))))),
            'a member 14 days in with 3+ captures and 0 published is the core leak'::text AS text
        UNION ALL
         SELECT 'faults_under_control'::text AS text,
            (( SELECT count(*) AS count
                   FROM ef_faults
                  WHERE (ef_faults.created_at > (now() - '24:00:00'::interval))) < 20),
            'real faults under 20/day'::text AS text
        UNION ALL
         SELECT 'every_member_has_signals'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM cockpit_members
                  WHERE ((cockpit_members.captures >= 2) AND (cockpit_members.signals = 0))))),
            'captures must convert into signals'::text AS text
        UNION ALL
         SELECT 'voice_corpus_healthy'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM cockpit_members
                  WHERE (cockpit_members.posts_with_text_primary_lang < 5)))),
            'every member needs at least 5 of their own posts with text in their main language'::text AS text
        UNION ALL
         SELECT 'no_placeholder_reports'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles
                  WHERE ((diagnostic_profiles.account_type = 'customer'::account_type) AND ((diagnostic_profiles.brand_assessment_results)::text ~ '\[[A-Za-z][^]["]{1,38}\]'::text))))),
            'Law #71 — a saved report must never contain a bracketed placeholder'::text AS text
        UNION ALL
         SELECT 'linkedin_addresses_are_confirmed'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM (diagnostic_profiles p
                     JOIN linkedin_connections c ON ((c.user_id = p.user_id)))
                  WHERE ((p.account_type = 'customer'::account_type) AND (COALESCE(c.source_status, ''::text) <> 'verified_by_read'::text))))),
            'Law #78 — only a successful read confirms an address'::text AS text
        UNION ALL
         SELECT 'every_customer_is_banded'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles
                  WHERE ((diagnostic_profiles.account_type = 'customer'::account_type) AND diagnostic_profiles.onboarding_completed AND (diagnostic_profiles.seniority_band IS NULL))))),
            'a member past onboarding must have a seniority band'::text AS text
        UNION ALL
         SELECT 'question_banks_complete'::text AS text,
            ((( SELECT count(*) AS count
                   FROM onboarding_questions
                  WHERE ((onboarding_questions.sector IS NULL) AND onboarding_questions.active)) = 27) AND (( SELECT count(*) AS count
                   FROM capability_dimensions
                  WHERE ((capability_dimensions.sector IS NULL) AND capability_dimensions.active)) = 24)),
            'every band must have its 9 questions and 8 dimensions'::text AS text
        UNION ALL
         SELECT 'report_written_from_evidence'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles p
                  WHERE ((p.account_type = 'customer'::account_type) AND (p.brand_assessment_results IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                           FROM evidence_fragments f
                          WHERE (f.user_id = p.user_id)))) AND (NOT (EXISTS ( SELECT 1
                           FROM linkedin_profile_snapshots s
                          WHERE (s.user_id = p.user_id)))))))),
            'Law #70 — the screen claims LinkedIn and captures; it must not be written from neither'::text AS text
        UNION ALL
         SELECT 'morning_promise_is_kept'::text AS text,
            ( SELECT morning_promise_state.may_promise
                   FROM morning_promise_state) AS may_promise,
            'Law #79 — the product may only promise what the system actually does.'::text AS text
        UNION ALL
         SELECT 'members_can_be_reached'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM diagnostic_profiles
                  WHERE ((diagnostic_profiles.account_type = 'customer'::account_type) AND diagnostic_profiles.onboarding_completed AND (diagnostic_profiles.timezone IS NULL))))),
            'a member promised a morning brief must have a timezone'::text AS text
        UNION ALL
         SELECT 'capture_read_inside_wait_window'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM (source_registry r
                     JOIN diagnostic_profiles p ON ((p.user_id = r.user_id)))
                  WHERE ((p.account_type = 'customer'::account_type) AND (r.created_at > (now() - '7 days'::interval)) AND ((r.processed_at IS NULL) OR (EXTRACT(epoch FROM (r.processed_at - r.created_at)) > (100)::numeric)))))),
            'Law #80 — the client waits 120s for claims. Any capture slower than 100s, or never processed, strands a member on the reading screen.'::text AS text
        UNION ALL
         SELECT 'writes_land_where_intended'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM lifecycle_emails e
                  WHERE ((e.sent_at > (now() - '30 days'::interval)) AND (e.metadata ? 'message_key'::text) AND (NOT (EXISTS ( SELECT 1
                           FROM lifecycle_email_log l
                          WHERE ((l.user_id = e.user_id) AND (l.message_key = (e.metadata ->> 'message_key'::text)))))))))),
            'Law #84 — a write that affects zero rows is invisible. Every lifecycle email we recorded as sent in the last 30 days must have its dedupe key in lifecycle_email_log; a lost key means the same member can be emailed again tomorrow. Unit is the send, and only sends that carry a message_key are counted.'::text AS text
        UNION ALL
         SELECT 'composer_contract_held'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM output_leak_log
                  WHERE (output_leak_log.created_at > GREATEST((now() - '7 days'::interval), '2026-08-25 18:56:00+00'::timestamp with time zone))))),
            'Law #85 — any contract violation since the contract shipped is a red light'::text AS text
        UNION ALL
         SELECT 'composer_language_parity'::text AS text,
            (( SELECT count(DISTINCT
                        CASE
                            WHEN (((operation_runs.meta -> 'result'::text) ->> 'content'::text) ~ '[؀-ۿ]'::text) THEN 'ar'::text
                            ELSE 'en'::text
                        END) AS count
                   FROM operation_runs
                  WHERE ((operation_runs.operation = 'studio_generate'::text) AND (operation_runs.started_at > (now() - '7 days'::interval)))) = 2),
            'Law #85 — a week where only one language was exercised is a week the other was not verified'::text AS text
        UNION ALL
         SELECT 'composer_never_orders_impossible_number'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM operation_runs
                  WHERE ((operation_runs.operation = 'studio_generate'::text) AND (operation_runs.started_at > (now() - '7 days'::interval)) AND (((operation_runs.meta -> 'result'::text) ->> 'evidence_has_number'::text) = 'false'::text) AND (((operation_runs.meta -> 'result'::text) ->> 'requested_ending'::text) = 'number'::text))))),
            'Law #86 — a close that demands a figure, drawn against digit-free evidence, cannot be satisfied'::text AS text
        UNION ALL
         SELECT 'composer_guard_ran_last'::text AS text,
            (NOT (EXISTS ( SELECT 1
                   FROM operation_runs
                  WHERE ((operation_runs.operation = 'studio_generate'::text) AND (operation_runs.started_at > (now() - '7 days'::interval)) AND (((operation_runs.meta -> 'result'::text) ->> 'guarded_after_rotation'::text) = 'false'::text))))),
            'Law #86 — a rewrite after the provenance guard is unguarded text'::text AS text
        )
 SELECT claim,
    ok,
    detail,
        CASE
            WHEN ok THEN 'pass'::text
            ELSE 'FAIL'::text
        END AS status
   FROM a;
CREATE OR REPLACE VIEW public.cockpit_members AS
 SELECT p.user_id,
    p.first_name,
    (p.created_at)::date AS joined_on,
    ((now())::date - (p.created_at)::date) AS day_n,
    COALESCE(e.captures, (0)::bigint) AS captures,
    e.last_capture,
    COALESCE(s.signals, (0)::bigint) AS signals,
    COALESCE(l.through_aura, (0)::bigint) AS posts_through_aura,
    COALESCE(r.read_posts, (0)::bigint) AS posts_read,
    COALESCE(m.emails, (0)::bigint) AS lifecycle_emails,
        CASE
            WHEN (COALESCE(l.through_aura, (0)::bigint) >= 3) THEN 'shipping'::text
            WHEN (COALESCE(l.through_aura, (0)::bigint) >= 1) THEN 'started'::text
            WHEN (COALESCE(e.captures, (0)::bigint) >= 1) THEN 'drawer'::text
            ELSE 'cold'::text
        END AS state,
    (e.last_capture >= ((now())::date - 7)) AS active_7d,
    COALESCE(v.primary_language, 'en'::text) AS primary_language,
    v.voice_refreshed_at,
    COALESCE(c.posts_with_text, (0)::bigint) AS posts_with_text,
    COALESCE(c.posts_with_text_primary_lang, (0)::bigint) AS posts_with_text_primary_lang,
    c.newest_post_with_text
   FROM (((((((member_accounts p
     LEFT JOIN LATERAL ( SELECT count(*) AS captures,
            (max(entries.created_at))::date AS last_capture
           FROM entries
          WHERE (entries.user_id = p.user_id)) e ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS signals
           FROM strategic_signals
          WHERE (strategic_signals.user_id = p.user_id)) s ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS through_aura
           FROM aura_output ao
          WHERE (ao.user_id = p.user_id)) l ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS read_posts
           FROM linkedin_posts rp
          WHERE ((rp.user_id = p.user_id) AND (rp.source_type = ANY (ARRAY['search_discovery'::text, 'imported'::text, 'linkedin_export'::text])))) r ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS emails
           FROM lifecycle_email_log
          WHERE (lifecycle_email_log.user_id = p.user_id)) m ON (true))
     LEFT JOIN LATERAL ( SELECT avp.language AS primary_language,
            max(avp2.updated_at) AS voice_refreshed_at
           FROM (authority_voice_profiles avp
             LEFT JOIN authority_voice_profiles avp2 ON ((avp2.user_id = p.user_id)))
          WHERE (avp.user_id = p.user_id)
          GROUP BY avp.language, avp.is_primary, avp.updated_at
          ORDER BY avp.is_primary DESC NULLS LAST, avp.updated_at DESC
         LIMIT 1) v ON (true))
     LEFT JOIN LATERAL ( SELECT count(*) AS posts_with_text,
            count(*) FILTER (WHERE ((COALESCE(v.primary_language, 'en'::text) = 'ar'::text) = (lp.post_text ~ '[\u0600-\u06FF]'::text))) AS posts_with_text_primary_lang,
            (max(COALESCE(lp.published_at, lp.synced_at, lp.created_at)))::date AS newest_post_with_text
           FROM linkedin_posts lp
          WHERE ((lp.user_id = p.user_id) AND (lp.post_text IS NOT NULL) AND (length(btrim(lp.post_text)) > 0) AND (lp.source_type = ANY (ARRAY['linkedin_export'::text, 'linkedin_own'::text, 'aura_generated'::text, 'carousel_studio'::text])))) c ON (true));
CREATE OR REPLACE VIEW public.cockpit_pulse AS
 SELECT now() AS as_of,
    ( SELECT count(*) AS count
           FROM cockpit_members) AS members,
    ( SELECT count(*) FILTER (WHERE cockpit_members.active_7d) AS count
           FROM cockpit_members) AS active_7d,
    ( SELECT count(*) FILTER (WHERE (cockpit_members.state = 'shipping'::text)) AS count
           FROM cockpit_members) AS shipping,
    ( SELECT count(*) FILTER (WHERE (cockpit_members.state = 'started'::text)) AS count
           FROM cockpit_members) AS started,
    ( SELECT count(*) FILTER (WHERE (cockpit_members.state = 'drawer'::text)) AS count
           FROM cockpit_members) AS drawer,
    ( SELECT count(*) FILTER (WHERE (cockpit_members.state = 'cold'::text)) AS count
           FROM cockpit_members) AS cold,
    ( SELECT COALESCE(sum(cockpit_members.captures), (0)::numeric) AS "coalesce"
           FROM cockpit_members) AS captures_total,
    ( SELECT count(*) AS count
           FROM entries
          WHERE ((entries.user_id IN ( SELECT ma.user_id
                   FROM member_accounts ma)) AND (entries.created_at > (now() - '7 days'::interval)))) AS captures_7d,
    ( SELECT count(*) AS count
           FROM linkedin_posts
          WHERE (linkedin_posts.user_id IN ( SELECT ma.user_id
                   FROM member_accounts ma))) AS posts_total,
    ( SELECT COALESCE(sum(cockpit_members.posts_through_aura), (0)::numeric) AS "coalesce"
           FROM cockpit_members) AS posts_through_aura,
    ( SELECT count(*) AS count
           FROM lifecycle_email_log
          WHERE ((lifecycle_email_log.user_id IN ( SELECT ma.user_id
                   FROM member_accounts ma)) AND (lifecycle_email_log.sent_at > (now() - '7 days'::interval)))) AS emails_7d,
    ( SELECT count(*) AS count
           FROM ef_faults
          WHERE (ef_faults.created_at > (now() - '48:00:00'::interval))) AS faults_48h,
    ( SELECT count(*) AS count
           FROM health_findings
          WHERE (health_findings.resolved_at IS NULL)) AS health_open;
CREATE OR REPLACE VIEW public.daily_brief_latest AS
 SELECT DISTINCT ON (brief_date) id,
    brief_date,
    payload,
    audit,
    created_at,
    run_seq,
    is_sent,
    rendered_html,
    run_reason
   FROM daily_brief_snapshots s
  ORDER BY brief_date DESC, run_seq DESC;
CREATE OR REPLACE VIEW public.ef_faults AS
 SELECT id,
    created_at,
    function_name,
    user_id,
    severity,
    error_message,
    context
   FROM ef_error_log
  WHERE (severity = ANY (ARRAY['high'::text, 'critical'::text]));
CREATE OR REPLACE VIEW public.influence_dashboard_view AS
 SELECT p.id,
    p.user_id,
    p.linkedin_post_id,
    p.post_url,
    p.post_text,
    p.hook,
    p.title,
    p.theme,
    p.tone,
    p.format_type,
    p.content_type,
    p.topic_label,
    p.media_type,
    p.tracking_status,
    p.source_type,
    p.published_at,
    p.like_count,
    p.comment_count,
    p.repost_count,
    p.engagement_score,
    p.created_at,
    COALESCE(m.impressions, 0) AS impressions,
    COALESCE(m.reactions, p.like_count) AS reactions,
    COALESCE(m.comments, p.comment_count) AS comments,
    COALESCE(m.shares, p.repost_count) AS shares,
    COALESCE(m.saves, 0) AS saves,
    COALESCE(m.engagement_rate, p.engagement_score) AS engagement_rate,
    m.snapshot_date AS metrics_date,
    m.source_type AS metrics_source_type
   FROM (linkedin_posts p
     LEFT JOIN LATERAL ( SELECT lpm.id,
            lpm.user_id,
            lpm.post_id,
            lpm.snapshot_date,
            lpm.impressions,
            lpm.reactions,
            lpm.comments,
            lpm.shares,
            lpm.saves,
            lpm.engagement_rate,
            lpm.created_at,
            lpm.source_type
           FROM linkedin_post_metrics lpm
          WHERE (lpm.post_id = p.id)
          ORDER BY lpm.snapshot_date DESC
         LIMIT 1) m ON (true))
  WHERE (p.tracking_status <> 'rejected'::text);
CREATE OR REPLACE VIEW public.influence_timeline AS
 SELECT DISTINCT ON (user_id, snapshot_date) user_id,
    snapshot_date,
    followers,
    follower_growth,
    engagement_rate,
    impressions,
    reactions,
    comments,
    shares,
    members_reached,
    source_type
   FROM influence_snapshots
  ORDER BY user_id, snapshot_date,
        CASE source_type
            WHEN 'linkedin_api'::text THEN 1
            WHEN 'manual'::text THEN 2
            WHEN 'csv_import'::text THEN 3
            WHEN 'linkedin_export'::text THEN 4
            WHEN 'sync'::text THEN 5
            ELSE 6
        END, created_at DESC;
CREATE OR REPLACE VIEW public.jobs_without_outcome_checks AS
 SELECT jobid,
    jobname,
    schedule
   FROM undeclared_jobs() undeclared_jobs(jobid, jobname, schedule);
CREATE OR REPLACE VIEW public.linkedin_connections_safe AS
 SELECT id,
    user_id,
    linkedin_id,
    display_name,
    handle,
    profile_name,
    profile_url,
    status,
    source_status,
    timezone,
    scopes,
    connected_at,
    last_synced_at,
    token_expires_at,
    created_at,
    updated_at
   FROM linkedin_connections
  WHERE (user_id = auth.uid());
CREATE OR REPLACE VIEW public.linkedin_read_readiness AS
 SELECT p.user_id,
    p.first_name,
    p.account_type,
    c.handle,
    c.profile_url,
    c.source_status,
    ( SELECT count(*) AS count
           FROM linkedin_profile_snapshots s
          WHERE (s.user_id = p.user_id)) AS snapshots,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM linkedin_profile_snapshots s
              WHERE (s.user_id = p.user_id))) THEN 'confirmed by a successful read'::text
            ELSE 'NOT CONFIRMED — the member must enter it themselves'::text
        END AS verdict
   FROM (diagnostic_profiles p
     LEFT JOIN linkedin_connections c ON ((c.user_id = p.user_id)));
CREATE OR REPLACE VIEW public.member_accounts AS
 SELECT id,
    user_id,
    firm,
    level,
    core_practice,
    sector_focus,
    north_star_goal,
    years_experience,
    leadership_style,
    generated_skills,
    skill_ratings,
    completed,
    created_at,
    brand_pillars,
    last_active_at,
    identity_intelligence,
    last_visit_at,
    first_name,
    onboarding_completed,
    primary_strength,
    audit_results,
    audit_interpretation,
    audit_completed_at,
    brand_assessment_answers,
    brand_assessment_results,
    brand_assessment_completed_at,
    avatar_url,
    phone_whatsapp,
    phone_verified,
    notification_prefs,
    linkedin_url,
    last_name,
    theme_preference,
    linkedin_handle,
    onboarding_step,
    audit_method,
    shared_learning_consent,
    lifecycle_opt_out,
    country,
    country_code,
    aura_card_ready_at,
    content_language,
    target_register,
    ui_dismissals,
    avatar_cutout_url,
    display_name_override,
    default_template,
    default_theme,
    timezone,
    account_type,
    excluded_reason,
    excluded_at
   FROM diagnostic_profiles
  WHERE (account_type = 'customer'::account_type);
CREATE OR REPLACE VIEW public.member_drafts AS
 SELECT id,
    user_id,
    signal_id,
    type,
    title,
    body,
    language,
    generation_params,
    status,
    created_at,
    updated_at,
    made_by,
    arrived_by,
    confidence,
    produced_by,
    prompt_version,
    model_used
   FROM content_items
  WHERE ((made_by = 'aura'::text) AND (status = 'draft'::text));
CREATE OR REPLACE VIEW public.member_own_posts AS
 SELECT id,
    user_id,
    linkedin_post_id,
    post_text,
    created_at,
    published_at,
    like_count,
    comment_count,
    repost_count,
    engagement_score,
    media_type,
    theme,
    tone,
    format_type,
    synced_at,
    post_url,
    title,
    hook,
    topic_label,
    framework_type,
    visual_style,
    content_type,
    carousel_structure_type,
    hook_style,
    cta_style,
    content_engine_output_type,
    visual_strategy_type,
    tracking_status,
    rejection_reason,
    source_type,
    source_metadata,
    enriched_by,
    source_trust,
    source_signal_id,
    published_confirmed_at,
    linkedin_url,
    quality_score,
    authorship,
    acquisition,
    claimed_at,
    publish_attempted_at,
    original_generated_text,
    ending_type,
    stance,
    moment_id,
    voice_match,
    unsourced_numbers_removed,
    edited_at,
    edit_distance,
    unsourced_entities_removed,
    voice_corpus_status,
    voice_corpus_reason,
    made_by,
    arrived_by,
    confidence,
    produced_by,
    prompt_version,
    model_used,
    text_is_snippet
   FROM linkedin_posts
  WHERE ((authorship = 'user_written'::text) AND (text_is_snippet IS NOT TRUE) AND (post_text IS NOT NULL) AND (length(post_text) > 250));
CREATE OR REPLACE VIEW public.member_published AS
 SELECT id,
    user_id,
    linkedin_post_id,
    post_text,
    created_at,
    published_at,
    like_count,
    comment_count,
    repost_count,
    engagement_score,
    media_type,
    theme,
    tone,
    format_type,
    synced_at,
    post_url,
    title,
    hook,
    topic_label,
    framework_type,
    visual_style,
    content_type,
    carousel_structure_type,
    hook_style,
    cta_style,
    content_engine_output_type,
    visual_strategy_type,
    tracking_status,
    rejection_reason,
    source_type,
    source_metadata,
    enriched_by,
    source_trust,
    source_signal_id,
    published_confirmed_at,
    linkedin_url,
    quality_score,
    authorship,
    acquisition,
    claimed_at,
    publish_attempted_at,
    original_generated_text,
    ending_type,
    stance,
    moment_id,
    voice_match,
    unsourced_numbers_removed,
    edited_at,
    edit_distance,
    unsourced_entities_removed,
    voice_corpus_status,
    voice_corpus_reason,
    made_by,
    arrived_by,
    confidence,
    produced_by,
    prompt_version,
    model_used,
    text_is_snippet
   FROM linkedin_posts
  WHERE ((tracking_status = 'published'::text) AND (published_at IS NOT NULL));
CREATE OR REPLACE VIEW public.mirror_funnel AS
 SELECT ( SELECT count(DISTINCT mirror_reads.handle) AS count
           FROM mirror_reads) AS completions,
    ( SELECT count(*) AS count
           FROM mirror_requests) AS requests,
    ( SELECT count(*) AS count
           FROM beta_allowlist
          WHERE (beta_allowlist.source = 'mirror'::text)) AS waitlist_from_mirror,
    round((((( SELECT count(*) AS count
           FROM beta_allowlist
          WHERE (beta_allowlist.source = 'mirror'::text)))::numeric / (NULLIF(( SELECT count(DISTINCT mirror_reads.handle) AS count
           FROM mirror_reads), 0))::numeric) * (100)::numeric), 1) AS conversion_pct;
CREATE OR REPLACE VIEW public.morning_promise_state AS
 WITH day_runs AS (
         SELECT ((ef_error_log.created_at AT TIME ZONE 'UTC'::text))::date AS day,
            max(COALESCE(((regexp_match(ef_error_log.error_message, 'candidates=(\d+)'::text))[1])::integer, 0)) AS max_candidates,
            sum(COALESCE(((regexp_match(ef_error_log.error_message, 'sent=(\d+)'::text))[1])::integer, 0)) AS sent_total
           FROM ef_error_log
          WHERE ((ef_error_log.function_name = 'send-morning-signal'::text) AND (ef_error_log.error_message ~~ 'MORNING_SIGNAL run%'::text) AND (ef_error_log.created_at >= (now() - '7 days'::interval)))
          GROUP BY (((ef_error_log.created_at AT TIME ZONE 'UTC'::text))::date)
        ), eligible AS (
         SELECT day_runs.day,
            day_runs.max_candidates,
            day_runs.sent_total
           FROM day_runs
          WHERE (day_runs.max_candidates > 0)
        )
 SELECT ( SELECT count(*) AS count
           FROM eligible) AS runs_checked,
    ( SELECT count(*) AS count
           FROM eligible
          WHERE (eligible.sent_total > 0)) AS runs_that_sent,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM eligible) = 0) THEN true
            ELSE (((( SELECT count(*) AS count
               FROM eligible
              WHERE (eligible.sent_total > 0)))::numeric / (( SELECT count(*) AS count
               FROM eligible))::numeric) >= 0.5)
        END AS may_promise;
CREATE OR REPLACE VIEW public.post_provenance AS
 SELECT id,
    user_id,
    linkedin_post_id,
    post_text,
    created_at,
    published_at,
    like_count,
    comment_count,
    repost_count,
    engagement_score,
    media_type,
    theme,
    tone,
    format_type,
    synced_at,
    post_url,
    title,
    hook,
    topic_label,
    framework_type,
    visual_style,
    content_type,
    carousel_structure_type,
    hook_style,
    cta_style,
    content_engine_output_type,
    visual_strategy_type,
    tracking_status,
    rejection_reason,
    source_type,
    source_metadata,
    enriched_by,
    source_trust,
    source_signal_id,
    published_confirmed_at,
    linkedin_url,
    quality_score,
    authorship,
    acquisition,
    claimed_at,
    publish_attempted_at,
    original_generated_text,
        CASE
            WHEN ((acquisition = 'published_via_aura'::text) OR (publish_attempted_at IS NOT NULL)) THEN 'aura_published'::text
            WHEN (authorship = ANY (ARRAY['aura_drafted'::text, 'aura_assisted'::text])) THEN 'aura_drafted'::text
            ELSE 'linkedin_only'::text
        END AS provenance
   FROM linkedin_posts p
  WHERE (published_at IS NOT NULL);
CREATE OR REPLACE VIEW public.runs_classified AS
 SELECT id,
    created_at,
    user_id,
    (state ->> 'name'::text) AS run_name,
    lower(regexp_replace(COALESCE((state ->> 'profile_url'::text), ''::text), '^.*linkedin\.com/in/|/$'::text, ''::text, 'g'::text)) AS handle,
        CASE
            WHEN (user_id IS NOT NULL) THEN identity_kind(user_id)
            WHEN (EXISTS ( SELECT 1
               FROM identity_registry r
              WHERE ((r.linkedin_handle IS NOT NULL) AND (lower(regexp_replace(COALESCE((s.state ->> 'profile_url'::text), ''::text), '^.*linkedin\.com/in/|/$'::text, ''::text, 'g'::text)) = lower(r.linkedin_handle))))) THEN ( SELECT r.kind
               FROM identity_registry r
              WHERE (lower(regexp_replace(COALESCE((s.state ->> 'profile_url'::text), ''::text), '^.*linkedin\.com/in/|/$'::text, ''::text, 'g'::text)) = lower(r.linkedin_handle))
             LIMIT 1)
            ELSE 'anonymous_visitor'::text
        END AS kind
   FROM assessment_sessions s;
CREATE OR REPLACE VIEW public.unified_content AS
 SELECT content_items.id,
    content_items.user_id,
    COALESCE(content_items.title, "left"(content_items.body, 60)) AS title,
    content_items.body AS content_body,
    content_items.type AS format_type,
    content_items.status,
    'content_items'::text AS source_table,
    content_items.created_at
   FROM content_items
UNION ALL
 SELECT linkedin_posts.id,
    linkedin_posts.user_id,
    COALESCE(linkedin_posts.hook, linkedin_posts.topic_label, "left"(linkedin_posts.post_text, 60)) AS title,
    linkedin_posts.post_text AS content_body,
    linkedin_posts.format_type,
    linkedin_posts.tracking_status AS status,
    'linkedin_posts'::text AS source_table,
    linkedin_posts.created_at
   FROM linkedin_posts;

-- 1. The gauge: days, not invocations.
CREATE OR REPLACE VIEW public.morning_promise_state AS
WITH day_runs AS (
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS day,
    max(COALESCE((regexp_match(error_message, 'candidates=(\d+)'))[1]::int, 0)) AS max_candidates,
    sum(COALESCE((regexp_match(error_message, 'sent=(\d+)'))[1]::int, 0))       AS sent_total
  FROM public.ef_error_log
  WHERE function_name = 'send-morning-signal'
    AND error_message LIKE 'MORNING_SIGNAL run%'
    AND created_at >= (now() - interval '7 days')
  GROUP BY 1
),
eligible AS (
  -- A day with zero eligible candidates is not a failure: the system correctly
  -- sent nothing because there was nothing worth sending. Such days are excluded.
  SELECT * FROM day_runs WHERE max_candidates > 0
)
SELECT
  (SELECT count(*) FROM eligible)                            AS runs_checked,
  (SELECT count(*) FROM eligible WHERE sent_total > 0)       AS runs_that_sent,
  CASE
    WHEN (SELECT count(*) FROM eligible) = 0 THEN true
    ELSE ((SELECT count(*) FROM eligible WHERE sent_total > 0)::numeric
          / (SELECT count(*) FROM eligible)::numeric) >= 0.5
  END                                                        AS may_promise;

COMMENT ON VIEW public.morning_promise_state IS
'Morning-signal promise gauge, measured in DAYS not invocations. The cron runs hourly (0 * * * *) but the function only sends in each member''s 07:00 local hour, so 23 of every 24 runs log sent=0 by design — an invocation-based ratio can never exceed 1/24 and the old definition could never be true. Unit here is the day: window = last 7 days of MORNING_SIGNAL run telemetry in ef_error_log; a day counts as eligible when the highest candidates=N logged that day is > 0 (days with nobody to send to are excluded from the denominator, not counted as failures); a day counts as sent when any run that day logged sent=N with N > 0. runs_checked = eligible days, runs_that_sent = eligible days that sent, may_promise = ratio >= 0.5 (and true when no day in the window had a candidate — nothing was owed, so nothing was broken).';

-- 2. Law #84 — a write that affects zero rows is invisible.
CREATE OR REPLACE VIEW public.cockpit_assertions AS
WITH a(claim, ok, detail) AS (
  SELECT 'briefs_sent_today'::text,
    EXISTS (SELECT 1 FROM daily_brief_snapshots WHERE created_at > now() - interval '26 hours' AND is_sent),
    'founder-daily-brief must actually send, not merely run'::text
  UNION ALL
  SELECT 'no_silent_member'::text,
    NOT EXISTS (SELECT 1 FROM cockpit_members WHERE captures >= 3 AND posts_through_aura = 0 AND day_n >= 14),
    'a member 14 days in with 3+ captures and 0 published is the core leak'::text
  UNION ALL
  SELECT 'faults_under_control'::text,
    (SELECT count(*) FROM ef_faults WHERE created_at > now() - interval '24 hours') < 20,
    'real faults under 20/day'::text
  UNION ALL
  SELECT 'every_member_has_signals'::text,
    NOT EXISTS (SELECT 1 FROM cockpit_members WHERE captures >= 2 AND signals = 0),
    'captures must convert into signals'::text
  UNION ALL
  SELECT 'voice_corpus_healthy'::text,
    NOT EXISTS (SELECT 1 FROM cockpit_members WHERE posts_with_text_primary_lang < 5),
    'every member needs at least 5 of their own posts with text in their main language'::text
  UNION ALL
  SELECT 'no_placeholder_reports'::text,
    NOT EXISTS (SELECT 1 FROM diagnostic_profiles WHERE account_type = 'customer'::account_type AND (brand_assessment_results)::text ~ '\[[A-Za-z][^]["]{1,38}\]'),
    'Law #71 — a saved report must never contain a bracketed placeholder'::text
  UNION ALL
  SELECT 'linkedin_addresses_are_confirmed'::text,
    NOT EXISTS (SELECT 1 FROM diagnostic_profiles p JOIN linkedin_connections c ON c.user_id = p.user_id
                WHERE p.account_type = 'customer'::account_type AND COALESCE(c.source_status, '') <> 'verified_by_read'),
    'Law #78 — only a successful read confirms an address'::text
  UNION ALL
  SELECT 'every_customer_is_banded'::text,
    NOT EXISTS (SELECT 1 FROM diagnostic_profiles WHERE account_type = 'customer'::account_type AND onboarding_completed AND seniority_band IS NULL),
    'a member past onboarding must have a seniority band'::text
  UNION ALL
  SELECT 'question_banks_complete'::text,
    ((SELECT count(*) FROM onboarding_questions WHERE sector IS NULL AND active) = 27
     AND (SELECT count(*) FROM capability_dimensions WHERE sector IS NULL AND active) = 24),
    'every band must have its 9 questions and 8 dimensions'::text
  UNION ALL
  SELECT 'report_written_from_evidence'::text,
    NOT EXISTS (SELECT 1 FROM diagnostic_profiles p
                WHERE p.account_type = 'customer'::account_type AND p.brand_assessment_results IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM evidence_fragments f WHERE f.user_id = p.user_id)
                  AND NOT EXISTS (SELECT 1 FROM linkedin_profile_snapshots s WHERE s.user_id = p.user_id)),
    'Law #70 — the screen claims LinkedIn and captures; it must not be written from neither'::text
  UNION ALL
  SELECT 'morning_promise_is_kept'::text,
    (SELECT may_promise FROM morning_promise_state),
    'Law #79 — the product may only promise what the system actually does.'::text
  UNION ALL
  SELECT 'members_can_be_reached'::text,
    NOT EXISTS (SELECT 1 FROM diagnostic_profiles WHERE account_type = 'customer'::account_type AND onboarding_completed AND timezone IS NULL),
    'a member promised a morning brief must have a timezone'::text
  UNION ALL
  SELECT 'capture_read_inside_wait_window'::text,
    NOT EXISTS (SELECT 1 FROM source_registry r JOIN diagnostic_profiles p ON p.user_id = r.user_id
                WHERE p.account_type = 'customer'::account_type AND r.created_at > now() - interval '7 days'
                  AND (r.processed_at IS NULL OR EXTRACT(epoch FROM (r.processed_at - r.created_at)) > 100)),
    'Law #80 — the client waits 120s for claims. Any capture slower than 100s, or never processed, strands a member on the reading screen.'::text
  UNION ALL
  SELECT 'writes_land_where_intended'::text,
    NOT EXISTS (
      SELECT 1 FROM lifecycle_emails e
      WHERE e.sent_at > now() - interval '30 days'
        AND e.metadata ? 'message_key'
        AND NOT EXISTS (
          SELECT 1 FROM lifecycle_email_log l
          WHERE l.user_id = e.user_id AND l.message_key = (e.metadata->>'message_key')
        )
    ),
    'Law #84 — a write that affects zero rows is invisible. Every lifecycle email we recorded as sent in the last 30 days must have its dedupe key in lifecycle_email_log; a lost key means the same member can be emailed again tomorrow. Unit is the send, and only sends that carry a message_key are counted.'::text
)
SELECT claim, ok, detail, CASE WHEN ok THEN 'pass' ELSE 'FAIL' END AS status FROM a;
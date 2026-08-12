-- 1. Backup of orphaned signals (rows whose user_id has no diagnostic_profiles row)
CREATE TABLE public.strategic_signals_orphans_20260811 AS
SELECT s.*
FROM public.strategic_signals s
LEFT JOIN public.diagnostic_profiles p ON p.user_id = s.user_id
WHERE p.user_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategic_signals_orphans_20260811 TO authenticated;
GRANT ALL ON public.strategic_signals_orphans_20260811 TO service_role;

ALTER TABLE public.strategic_signals_orphans_20260811 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only select" ON public.strategic_signals_orphans_20260811
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admin only insert" ON public.strategic_signals_orphans_20260811
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin only update" ON public.strategic_signals_orphans_20260811
  FOR UPDATE TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admin only delete" ON public.strategic_signals_orphans_20260811
  FOR DELETE TO authenticated USING (public.is_current_user_admin());

-- 2. Delete the orphans (both profile-orphans and any auth.users orphans)
DELETE FROM public.strategic_signals s
WHERE NOT EXISTS (SELECT 1 FROM public.diagnostic_profiles p WHERE p.user_id = s.user_id)
   OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = s.user_id);

-- 3. The missing foreign key, matching entries / evidence_fragments / linkedin_posts
ALTER TABLE public.strategic_signals
  ADD CONSTRAINT strategic_signals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. Law #71 assertion: only match a real bracketed placeholder in report text.
--    The old pattern matched JSON array storage (e.g. ["Value-Based P&L", ...]).
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
            (( SELECT count(*) FROM ef_faults WHERE ef_faults.created_at > (now() - '24:00:00'::interval))) < 20,
            'real faults under 20/day'::text
        UNION ALL
         SELECT 'every_member_has_signals'::text,
            NOT (EXISTS ( SELECT 1 FROM cockpit_members
                  WHERE cockpit_members.captures >= 2 AND cockpit_members.signals = 0)),
            'captures must convert into signals'::text
        UNION ALL
         SELECT 'voice_corpus_healthy'::text,
            NOT (EXISTS ( SELECT 1 FROM cockpit_members WHERE cockpit_members.posts_with_text_primary_lang < 5)),
            'every member needs at least 5 of their own posts with text in their main language'::text
        UNION ALL
         SELECT 'no_placeholder_reports'::text,
            NOT (EXISTS ( SELECT 1 FROM diagnostic_profiles
                  WHERE diagnostic_profiles.account_type = 'customer'::account_type
                    AND diagnostic_profiles.brand_assessment_results::text ~ '\[[A-Za-z][^]["]{1,38}\]'::text)),
            'Law #71 — a saved report must never contain a bracketed placeholder'::text
        UNION ALL
         SELECT 'linkedin_addresses_are_confirmed'::text,
            NOT (EXISTS ( SELECT 1 FROM diagnostic_profiles p
                     JOIN linkedin_connections c ON c.user_id = p.user_id
                  WHERE p.account_type = 'customer'::account_type AND COALESCE(c.source_status, ''::text) <> 'verified_by_read'::text)),
            'Law #78 — only a successful read confirms an address'::text
        UNION ALL
         SELECT 'every_customer_is_banded'::text,
            NOT (EXISTS ( SELECT 1 FROM diagnostic_profiles
                  WHERE diagnostic_profiles.account_type = 'customer'::account_type AND diagnostic_profiles.onboarding_completed AND diagnostic_profiles.seniority_band IS NULL)),
            'a member past onboarding must have a seniority band'::text
        UNION ALL
         SELECT 'question_banks_complete'::text,
            (( SELECT count(*) FROM onboarding_questions WHERE onboarding_questions.sector IS NULL AND onboarding_questions.active)) = 27
            AND (( SELECT count(*) FROM capability_dimensions WHERE capability_dimensions.sector IS NULL AND capability_dimensions.active)) = 24,
            'every band must have its 9 questions and 8 dimensions'::text
        UNION ALL
         SELECT 'report_written_from_evidence'::text,
            NOT (EXISTS ( SELECT 1 FROM diagnostic_profiles p
                  WHERE p.account_type = 'customer'::account_type AND p.brand_assessment_results IS NOT NULL
                    AND NOT (EXISTS ( SELECT 1 FROM evidence_fragments f WHERE f.user_id = p.user_id))
                    AND NOT (EXISTS ( SELECT 1 FROM linkedin_profile_snapshots s WHERE s.user_id = p.user_id)))),
            'Law #70 — the screen claims LinkedIn and captures; it must not be written from neither'::text
        UNION ALL
         SELECT 'morning_promise_is_kept'::text,
            ( SELECT morning_promise_state.may_promise FROM morning_promise_state),
            'Law #79 — the product may only promise what the system actually does.'::text
        UNION ALL
         SELECT 'members_can_be_reached'::text,
            NOT (EXISTS ( SELECT 1 FROM diagnostic_profiles
                  WHERE diagnostic_profiles.account_type = 'customer'::account_type AND diagnostic_profiles.onboarding_completed AND diagnostic_profiles.timezone IS NULL)),
            'a member promised a morning brief must have a timezone'::text
        UNION ALL
         SELECT 'capture_read_inside_wait_window'::text,
            NOT (EXISTS ( SELECT 1 FROM source_registry r
                     JOIN diagnostic_profiles p ON p.user_id = r.user_id
                  WHERE p.account_type = 'customer'::account_type AND r.created_at > (now() - '7 days'::interval)
                    AND (r.processed_at IS NULL OR EXTRACT(epoch FROM r.processed_at - r.created_at) > 100::numeric))),
            'Law #80 — the client waits 120s for claims. Any capture slower than 100s, or never processed, strands a member on the reading screen.'::text
        )
 SELECT claim, ok, detail,
        CASE WHEN ok THEN 'pass'::text ELSE 'FAIL'::text END AS status
   FROM a;
# 02 — Database

Everything here was read from the live Lovable Cloud (Supabase) Postgres with `pg_catalog`
introspection on 2026-09-04. Schema `public` only unless stated.

Scale: **140 tables**, **211 functions**, **343 RLS policies**, **20 views**, **5 storage buckets**,
**44 pg_cron jobs**.

## Notation used in the table listing

```
col type!  ->  NOT NULL
=expr      ->  column DEFAULT expr
```
Every `FOREIGN KEY ... REFERENCES auth.users(id)` is a reference into the Supabase-managed
`auth` schema; there is no `public.users` table. Per-user data is keyed by `user_id uuid`.

## Extensions installed

| extension | version | schema |
|---|---|---|
| pg_cron | 1.6.4 | pg_catalog |
| pg_net | 0.20.0 | extensions |
| pg_stat_statements | 1.11 | extensions |
| pgcrypto | 1.3 | extensions |
| plpgsql | 1.0 | pg_catalog |
| supabase_vault | 0.3.1 | vault |
| uuid-ossp | 1.1 | extensions |
| vector | 0.8.0 | public |

## Enums

| type | labels (in sort order) |
|---|---|
| `account_type` | customer, staff, test, demo |
| `app_role` | admin, member |
| `plan_type` | trial, free, paid |
| `seniority_band` | work, table, room |

## Views (schema `public`, 20)

`unified_content`, `ef_faults`, `influence_timeline`, `influence_dashboard_view`,
`runs_classified`, `cockpit_assertions`, `member_accounts`, `cockpit_members`, `cockpit_pulse`,
`member_drafts`, `member_own_posts`, `member_published`, `mirror_funnel`,
`morning_promise_state`, `linkedin_connections_safe`, `daily_brief_latest`,
`linkedin_read_readiness`, `jobs_without_outcome_checks`, `post_provenance`, `aura_output`.

Full view bodies are not reproduced here — run
`select definition from pg_views where schemaname='public' and viewname='<name>';`
or search `supabase/migrations/` for `CREATE OR REPLACE VIEW public.<name>`.
Views were rebuilt with `security_invoker = true` (see the "publication removal" migration set),
so a view returns only rows the calling member's RLS already allows.

## Storage buckets

| bucket | public | file size limit | notes |
|---|---|---|---|
| `capture-images` | **true** | none | Intentionally public — see `mem://technical/storage-security-decision`. |
| `documents` | false | none | CV / document uploads feeding `documents` + `document_chunks`. |
| `captures` | false | none | Legacy capture attachments. |
| `avatars` | **true** | 5 MiB | Profile images. |
| `deck-media` | false | 25 MiB | Carousel/deck imagery. |

Bucket policies live on `storage.objects`; they are listed in the RLS section below under
`storage.objects`.

## Tables

### _probe_resp  (RLS ON)
id bigint | status integer | content text | ts timestamptz =now()
CONSTRAINTS: none. Internal probe/diagnostic scratch table.

### admin_action_log  (RLS ON)
id uuid! =gen_random_uuid() | created_at timestamptz! =now() | actor_id uuid | action text! | task text | target_user_id uuid | target_ref text | result text | detail jsonb ='{}'
CONSTRAINTS: PRIMARY KEY (id)
INDEXES: idx_admin_action_created (created_at DESC), idx_admin_action_target (target_user_id)

### admin_settings  (RLS ON)
key text! | value jsonb! ='{}' | updated_at timestamptz! =now()
CONSTRAINTS: PRIMARY KEY (key)

### agent_findings  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | url text | title text | source text | relevance_score numeric | implication text | status text! ='pending' | entry_id uuid | perplexity_raw jsonb | error_detail text | created_at timestamptz! =now() | themes text[]! ='{}' | dropped_themes text[]! ='{}'
CONSTRAINTS: PK (id) ;; CHECK status IN ('pending','kept','dismissed','below_bar','duplicate','error','skipped') ;; FK user_id -> auth.users(id) ON DELETE SET NULL
INDEXES: (user_id, created_at DESC), (user_id, status)

### ai_usage_log  (RLS ON)
id uuid! =gen_random_uuid() | created_at timestamptz! =now() | user_id uuid | function_name text! | provider text! | model text | input_tokens int =0 | output_tokens int =0 | total_tokens int =(COALESCE(input_tokens,0)+COALESCE(output_tokens,0)) | est_cost_usd numeric(12,6) =0 | success boolean =true | metadata jsonb ='{}'
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE SET NULL
INDEXES: created_at DESC, function_name, provider, user_id

### api_health_checks  (RLS ON)
id uuid! =gen_random_uuid() | run_at timestamptz! =now() | results jsonb! ='[]' | checked int! =0 | failed int! =0 | created_at timestamptz! =now()
CONSTRAINTS: PK (id)

### assessment_sessions  (RLS ON)
id uuid! =gen_random_uuid() | token text! | ip_hash text | created_at timestamptz! =now() | last_seen_at timestamptz! =now() | expires_at timestamptz! =(now() + '7 days') | user_id uuid | runs_started int! =0 | state jsonb! ='{}'
CONSTRAINTS: PK (id) ;; UNIQUE (token) ;; FK user_id -> auth.users(id) ON DELETE CASCADE
INDEXES: idx_asess_expiry (expires_at) WHERE user_id IS NULL, idx_asess_ip (ip_hash, created_at)
Anonymous assessment sessions; claimed by `claim_assessment_session(p_token)` at signup.

### audience_demographics  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | category text! | value text! | percentage text! | percentage_numeric numeric | imported_at timestamptz =now() | source_type text ='linkedin_export' | period_start date | period_end date | upload_batch_id uuid
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### audience_insights  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | insight_headline text! | insight_body text! | audience_strengths text[] | audience_gaps text[] | next_action text | generated_at timestamptz! =now() | demographics_hash text
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### audit_interpretation_backup_20260816  (RLS ON)
user_id uuid | first_name text | audit_interpretation text | backed_up_at timestamptz
CONSTRAINTS: none. Dated backup table — safe to drop after verification.

### aura_conversation_memory  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | session_date date! =CURRENT_DATE | summary text | key_decisions text[] | topics_discussed text[] | actions_committed text[] | created_at timestamptz =now() | updated_at timestamptz =now() | role text | content text | session_id text | metadata jsonb ='{}'
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE
Backs Your Desk (`ask-aura`) memory: per-session rows plus daily summaries.

### authority_scores  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | snapshot_date date! =CURRENT_DATE | authority_score numeric! =0 | momentum_score numeric! =0 | consistency_score numeric! =0 | engagement_score numeric! =0 | strategic_resonance_score numeric! =0 | created_at timestamptz! =now()
CONSTRAINTS: PK (id) ;; UNIQUE (user_id, snapshot_date) ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### authority_voice_profiles  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | tone text! ='' | preferred_structures jsonb! ='[]' | storytelling_patterns jsonb! ='[]' | example_posts jsonb! ='[]' | admired_posts jsonb! ='[]' | vocabulary_preferences jsonb! ='{}' | created_at timestamptz! =now() | updated_at timestamptz! =now() | language text! ='en' | is_primary boolean! =true | allowed_endings text[]! ='{}' | mode_key text | mode_label text | readiness text | in_voice_moves text[] | in_voice_opens text[] | in_voice_lands text[] | marker_style jsonb! ='{}'
CONSTRAINTS: PK (id) ;; CHECK mode_key IN ('executive','thought_leadership','educational','personal','contrarian','default') ;; CHECK readiness IN ('forming','developing','working','reliable','distinctive') ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### beta_allowlist  (RLS ON)
id uuid! =gen_random_uuid() | email text! | name text | seniority text | sector text | status text! ='pending' | source text ='waitlist' | personal_note text | requested_at timestamptz =now() | invited_at timestamptz | activated_at timestamptz | user_id uuid | invited_by uuid | created_at timestamptz =now() | updated_at timestamptz =now() | ref text
CONSTRAINTS: PK (id) ;; UNIQUE (email) ;; CHECK status IN ('pending','approved','active','invited') ;; FK user_id, invited_by -> auth.users(id) ON DELETE SET NULL
NOTE: no longer an entitlement gate — entitlements read `diagnostic_profiles.plan` (see 03).

### beta_feedback  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | rating int | message text | page text | feedback_type text ='general' | created_at timestamptz =now()
CONSTRAINTS: PK (id) ;; CHECK rating BETWEEN 1 AND 10 ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### capability_dimensions  (RLS ON)
id uuid! =gen_random_uuid() | band seniority_band! | sector text | position smallint! | name text! | why_line text! | anchor_low text! | anchor_high text! | active boolean! =true | created_at timestamptz! =now() | framework text | anchor_mid text | instrument_version smallint! =2
CONSTRAINTS: PK (id). Reference data — seeded, see supabase/seed.sql.

### capability_radar_snapshots  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | band seniority_band! | instrument_version smallint! =2 | levels jsonb! ='{}' | taken_at timestamptz! =now()
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE
`taken_at` is DB-clock only — the client must never send it (see 06 known issues).

### capability_responses  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | dimension_id uuid! | level smallint! | instrument_version smallint! =2 | answered_at timestamptz! =now()
CONSTRAINTS: PK (id) ;; UNIQUE (user_id, dimension_id) ;; CHECK level BETWEEN 1 AND 3 ;; FK dimension_id -> capability_dimensions(id) CASCADE ;; FK user_id -> auth.users(id) CASCADE

### captures  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | type text! | raw_content text | extracted_text text | metadata jsonb ='{}' | processing_status text! ='pending' | error_message text | source_url text | created_at timestamptz! =now()
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE
LEGACY — `entries` is the canonical knowledge table. Do not write here.

### chat_conversations  (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | title text! ='New Chat' | linked_type text | linked_id uuid | linked_label text | pinned boolean! =false | created_at timestamptz! =now() | updated_at timestamptz! =now()
CONSTRAINTS: PK (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### chat_messages  (RLS ON)
id uuid! =gen_random_uuid() | conversation_id uuid! | user_id uuid! | role text! | content text! | mode text | created_at timestamptz! =now()
CONSTRAINTS: PK (id) ;; CHECK role IN ('user','assistant') ;; FK conversation_id -> chat_conversations(id) CASCADE ;; FK user_id -> auth.users(id) CASCADE

### contact_messages (RLS ON)
id uuid! =gen_random_uuid() | email text! | name text! | topic text! | message text! | ip_hash text | delivered boolean! =false | created_at timestamptz! =now()
C: PRIMARY KEY (id)

### content_gate_cache (RLS ON)
content_hash text! | verdict jsonb! | judge_model text | created_at timestamptz! =now()
C: PRIMARY KEY (content_hash)

### content_gate_results (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | post_id uuid | function_name text | language text | overall_score integer | pass boolean | assertions jsonb | weaknesses jsonb | skipped boolean! =false | skip_reason text | judge_model text | created_at timestamptz! =now() | content_hash text | expected_ending text
C: PRIMARY KEY (id) ;; FK user_id -> auth.users(id) ON DELETE CASCADE

### content_items (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | signal_id uuid | type text! | title text! ='' | body text! ='' | language text! ='en' | generation_params jsonb! ='{}' | status text! ='draft' | created_at timestamptz! =now() | updated_at timestamptz! =now() | made_by text! ='unknown' | arrived_by text! ='unknown' | confidence text! ='unknown' | produced_by text | prompt_version text | model_used text | hook_style text | ending_type text | move_id text | beats text[] | shape_repeat text | voice_match numeric | voice_fidelity_flags text[] | tsv tsvector | embedding vector(1536)
C: PK (id) ;; CHECK arrived_by IN ('published_through_aura','imported_by_member','discovered_by_search','entered_by_member','generated_in_place','unknown') ;; CHECK confidence IN ('confirmed','reported','guessed','unknown') ;; CHECK made_by IN ('member','aura','aura_edited_by_member','machine','unknown') ;; CHECK produced_by IS NULL OR IN ('composer','weekly_drafts','overnight_agent','carousel_studio') ;; CHECK status IN ('draft','published','discarded') ;; CHECK type IN ('linkedin_post','carousel','framework','article','whitepaper') ;; FK signal_id -> strategic_signals(id) SET NULL ;; FK user_id -> auth.users(id) CASCADE

### content_lineage (RLS ON)
id bigint! =nextval('content_lineage_id_seq') | content_table text! | content_id uuid! | contributor_kind text! | contributor_id uuid | role text! | note text | created_at timestamptz! =now()
C: PK (id) ;; CHECK content_table IN ('linkedin_posts','content_items') ;; CHECK contributor_kind IN ('signal','capture','evidence_fragment','document','trend','voice_profile') ;; CHECK role IN ('topic','evidence','number','background','timing','voice')

### daily_brief_snapshots (RLS ON)
id uuid! =gen_random_uuid() | brief_date date! | payload jsonb! ='{}' | audit jsonb! ='{}' | created_at timestamptz! =now() | run_seq integer! | is_sent boolean! =false | rendered_html text | run_reason text
C: PK (id) ;; UNIQUE (brief_date, run_seq). Append-only — enforced by trigger `daily_brief_snapshots_immutable`.

### decisions (RLS ON)
id uuid! =gen_random_uuid() | decided_on date! =now()::date | title text! | decision text! | rationale text | expected_outcome text | metric_key text | baseline_value numeric | expected_value numeric | review_on date | status text! ='pending' | actual_value numeric | reviewed_on date | review_note text | created_at timestamptz! =now()
C: PK (id) ;; CHECK status IN ('pending','open','confirmed','refuted','inconclusive') ;; CHECK status<>'open' OR (review_on IS NOT NULL AND metric_key IS NOT NULL AND (metric_key='none' OR expected_value IS NOT NULL))

### deck_events (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | deck_id text | signal_id uuid | event text! | lang text | theme text | length integer | fit_steps integer | invariant_failures text[] | duration_ms integer | created_at timestamptz! =now() | pdf_bytes bigint | template text
C: PK (id) ;; CHECK event IN ('generated','validation_failed','rendered','exported','export_failed','published','publish_failed','abandoned','error') ;; FK user_id -> auth.users(id) CASCADE

### decks (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | signal_id uuid | lang text | template text | theme text | slides jsonb | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id)

### deleted_test_accounts_20260818 (RLS ON)
id bigint! =nextval(...) | source_table text | user_id uuid | row_json jsonb | deleted_at timestamptz =now()
C: PK (id). Dated archive of purged test accounts.

### design_system (RLS ON)
id uuid! =gen_random_uuid() | scope text! ='global' | version integer! =1 | is_active boolean! =true | tokens jsonb! ='{}' | created_at timestamptz =now() | updated_at timestamptz =now() | created_by uuid
C: PK (id) ;; FK created_by -> auth.users(id) SET NULL. Activated through `activate_design_version()`.

### desk_answer_feedback (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | question text! ='' | answer text! ='' | verdict text! | created_at timestamptz! =now()
C: PK (id) ;; CHECK verdict IN ('yes','no')

### desk_eval_questions (RLS ON)
id uuid! =gen_random_uuid() | category text! | question text! | expects text! | trap boolean! =false | active boolean! =true | created_at timestamptz! =now() | question_set text! ='set_1'
C: PK (id). Reference data for the Desk evaluation harness (sets set_1/set_2/set_3/smoke).

### desk_eval_runs (RLS ON)
id uuid! =gen_random_uuid() | question_id uuid! | run_at timestamptz! =now() | answer text | mode_detected text | verdict text | failure_kind text | notes text | axis_consistency text | axis_asks_when_unclear text
C: PK (id) ;; CHECK verdict IN ('pass','fail','partial') ;; FK question_id -> desk_eval_questions(id) CASCADE

### desk_learning (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | kind text! | observation text! | evidence_count integer! =0 | evidence jsonb! ='{}' | confidence text! ='observed' | dismissed boolean! =false | first_seen timestamptz! =now() | last_seen timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, kind, observation) ;; CHECK confidence IN ('observed','strong') ;; CHECK kind IN ('asks_about','acts_on','rejects','talks_like','corrects')

### desk_number_violations (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | run_at timestamptz! =now() | question text | figure text! | resolved text! | answer_excerpt text
C: PK (id) ;; CHECK resolved IN ('retry_fixed','sentence_dropped')

### diagnostic_profiles (RLS ON)  — the central per-member profile row, 68 columns
id uuid! =gen_random_uuid() | user_id uuid! | firm text | level text | core_practice text | sector_focus text | north_star_goal text | years_experience text | leadership_style text | generated_skills jsonb! ='[]' | skill_ratings jsonb! ='{}' | completed boolean! =false | created_at timestamptz! =now() | brand_pillars text[]! ='{}' | last_active_at timestamptz =now() | identity_intelligence jsonb! ='{}' | last_visit_at timestamptz =now() | first_name text | onboarding_completed boolean! =false | primary_strength text | audit_results jsonb ='{}' | audit_interpretation text | audit_completed_at timestamptz | brand_assessment_answers jsonb ='{}' | brand_assessment_results jsonb ='{}' | brand_assessment_completed_at timestamptz | avatar_url text | phone_whatsapp text | phone_verified boolean =false | notification_prefs jsonb =(defaults: inapp_all true, push_enabled false, email_weekly_brief true, email_signal_shifts true, whatsapp_silence_alarm false, whatsapp_timing_windows false) | linkedin_url text | last_name text | theme_preference text ='nebula' | linkedin_handle text | onboarding_step integer =0 | audit_method text | shared_learning_consent boolean! =false | lifecycle_opt_out boolean! =false | country text | country_code text | aura_card_ready_at timestamptz | content_language text! ='en' | target_register text | ui_dismissals jsonb! ='{}' | avatar_cutout_url text | display_name_override text | default_template text | default_theme text | timezone text | account_type account_type! ='customer' | excluded_reason text | excluded_at timestamptz | seniority_band seniority_band | band_source text | instrument_version smallint | answered_band seniority_band | cv_crosscheck jsonb | cv_crosscheck_at timestamptz | tier text! ='read' | consented_at timestamptz | consent_version text | journey_reset_at timestamptz | composer_sort_pref text | plan plan_type! ='trial' | plan_started_at timestamptz | trial_ends_at timestamptz | plan_source text | desk_prefs jsonb! ='{}'
C: PK (id) ;; UNIQUE (user_id) ;; FK user_id -> auth.users(id) CASCADE ;; CHECK band_source IN ('detected','confirmed','corrected') ;; CHECK composer_sort_pref IN ('recommended','newest','most_evidence','never_written') ;; CHECK account_type='customer' OR excluded_reason IS NOT NULL ;; CHECK theme_preference IN ('nebula','prism','terrain') ;; CHECK tier IN ('read','loop')
GUARDED: trigger `guard_profile_billing_columns` reverts client writes to plan/tier/account_type/
trial_ends_at/plan_source/excluded_reason/excluded_at unless the caller is admin or service role.
Trigger `guard_account_type_changes` and `ensure_diagnostic_profile` also run on this table.

### discovery_review_queue (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | candidate_url text! | snippet text | confidence numeric! =0 | rejection_reason text! ='authorship_uncertain' | authorship_signals jsonb! ='[]' | reviewed boolean! =false | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### document_briefs (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | document_id uuid! | thesis text | key_points jsonb! ='[]' | key_figures jsonb! ='[]' | author_pov text | contrarian_angles jsonb! ='[]' | so_what jsonb! ='[]' | coverage jsonb! ='{}' | grounding_score real | pipeline_version smallint! =1 | model text | created_at timestamptz! =now() | tsv tsvector | embedding vector(1536)
C: PK (id) ;; UNIQUE (document_id, pipeline_version) ;; FK document_id -> documents(id) CASCADE

### document_chunks (RLS ON)
id uuid! =gen_random_uuid() | document_id uuid! | user_id uuid! | content text! | chunk_index integer! =0 | metadata jsonb ='{}' | tsv tsvector =to_tsvector('english', COALESCE(content,'')) | created_at timestamptz! =now() | embedding vector(1536) | pipeline_version smallint! =1
C: PK (id) ;; FK document_id -> documents(id) CASCADE ;; FK user_id -> auth.users(id) CASCADE

### document_jobs (RLS ON)
id uuid! =gen_random_uuid() | document_id uuid! | user_id uuid! | stage text! ='queued' | cursor integer! =0 | total integer | slice_size integer! =25 | attempts integer! =0 | peak_memory_mb integer | failure_code text | error_detail text | last_heartbeat timestamptz! =now() | created_at timestamptz! =now()
C: PK (id) ;; FK document_id -> documents(id) CASCADE ;; FK user_id -> auth.users(id) CASCADE

### documents (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | filename text! | file_url text! | file_type text! | status text! ='processing' | summary text | page_count integer | created_at timestamptz! =now() | error_message text | file_size bigint | pages_total integer | pages_read integer | extraction_method text | processing_started_at timestamptz | attempt_count integer! =0 | display_title text | document_type text | cv_label text
C: PK (id) ;; CHECK cv_label IN ('latest','best','target') and only when document_type='cv' ;; CHECK document_type IN ('cv','portfolio','project','testimonial','talk','other') ;; FK user_id -> auth.users(id) CASCADE

### draft_edits (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | post_id uuid | language text | served_text text | published_text text | served_chars integer | published_chars integer | levenshtein_distance integer | similarity_ratio numeric | first_line_changed boolean | numbers_removed integer | numbers_added integer | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE. Feeds voice learning (edit pairs).

### ef_error_log (RLS ON)
id uuid! =gen_random_uuid() | created_at timestamptz! =now() | function_name text! | user_id uuid | severity text! ='error' | error_message text | context jsonb ='{}'
C: PK (id) ;; FK user_id -> auth.users(id) SET NULL. Every edge function writes failures here.

### ef_event_log_retired_20260724 (RLS ON)
Retired predecessor of `ef_error_log`. Same shape. Read-only history.

### entries (RLS ON)  — canonical knowledge/capture table
id uuid! =gen_random_uuid() | user_id uuid! | type text! | content text! | summary text | created_at timestamptz! =now() | updated_at timestamptz! =now() | skill_pillar text | title text | has_strategic_insight boolean! =false | pinned boolean! =false | image_url text | tsv tsvector =weighted(title A, summary B, content C) | embedding vector(1536) | account_name text | framework_tag text | extract_attempts integer! =0 | source_type text! ='user'
C: PK (id) ;; CHECK type IN ('link','voice','text','image','doc') ;; FK user_id -> auth.users(id) CASCADE
`source_type='aura_agent'` rows are Aura-found, NOT member captures — counted separately (see 03).

### eval_metrics (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | metric text! | value numeric! | context jsonb! ='{}' | measured_at timestamptz! =now() | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) SET NULL

### evidence_fragments (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | source_registry_id uuid! | fragment_type text! | title text! | content text! | confidence numeric! =0.7 | skill_pillars text[]! ='{}' | tags text[]! ='{}' | entities jsonb ='[]' | metadata jsonb ='{}' | embedding vector(1536) | tsv tsvector | created_at timestamptz! =now() | pipeline_version smallint! =1
C: PK (id) ;; FK source_registry_id -> source_registry(id) CASCADE ;; FK user_id -> auth.users(id) CASCADE

### evidence_jobs (RLS ON)
id uuid! =gen_random_uuid() | source_registry_id uuid! | user_id uuid! | cursor integer! =0 | total integer | fragments_written integer! =0 | status text! ='queued' | last_heartbeat timestamptz! =now() | error_detail text | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### external_costs (RLS ON)
id uuid! =gen_random_uuid() | name text! | amount_usd numeric! =0 | cycle text! ='monthly' | renews_on date | status text! ='active' | notes text | last_verified date =CURRENT_DATE | created_at timestamptz =now()
C: PK (id). Admin cost console reference data.

### facet_states (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | facet text! | value numeric! =0 | uncertainty numeric! =1 | last_reinforced_at timestamptz | inputs jsonb! ='{}' | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, facet) ;; CHECK facet IN ('identity','edge','voice','focus','audience','discernment','conviction') ;; CHECK value BETWEEN 0 AND 1 ;; CHECK uncertainty BETWEEN 0 AND 1 ;; FK user_id -> auth.users(id) CASCADE

### focus_accounts (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | name text! | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, name) ;; FK user_id -> auth.users(id) CASCADE

### framework_activations (RLS ON)
id uuid! =gen_random_uuid() | framework_id uuid! | user_id uuid! | output_type text! | title text! | content text! | metadata jsonb ='{}' | created_at timestamptz! =now()
C: PK (id) ;; FK framework_id -> master_frameworks(id) CASCADE ;; FK user_id -> auth.users(id) CASCADE

### freshness_checks (RLS ON)
check_key text! | claim text! | table_name text! | timestamp_column text! | filter_sql text | warn_after_hours numeric! | error_after_hours numeric! | enabled boolean! =true | owning_job text
C: PK (check_key). Drives `cockpit_freshness()` — reference data, seed it.

### funnel_daily_ratio (RLS ON)
day date! | opens_users integer! =0 | signals_users integer! =0 | ratio numeric! =0 | created_at timestamptz! =now()
C: PK (day)

### guide_articles (RLS ON)
id uuid! =gen_random_uuid() | slug text! | tab text! | category text! | question_en text | answer_en text! | formula_note_en text | related_terms text[]! ='{}' | surfaces text[]! ='{}' | sort_order integer! =0 | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (slug). Public help content — seed data.

### guide_slug_misses (RLS ON)
slug text! | surface text! | count integer! =1 | first_seen timestamptz! =now() | last_seen timestamptz! =now()
C: PK (slug, surface). Records requests for guide entries that do not exist.

### health_findings (RLS ON)
id uuid! =gen_random_uuid() | code text! | severity text! | detail text! | first_seen timestamptz! =now() | last_seen timestamptz! =now() | resolved_at timestamptz | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; CHECK severity IN ('critical','warn','info')

### home_address (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | address_date date! | lens text! | lens_reason text! | address_md text! | moves jsonb! ='[]' | facts jsonb! ='{}' | model text | generated_at timestamptz! =now() | quality jsonb! ='{}'
C: PK (id) ;; UNIQUE (user_id, address_date) ;; CHECK lens IN ('record','room','shape') ;; FK user_id -> auth.users(id) CASCADE

### identity_registry (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | email text | linkedin_handle text | kind text! | note text | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id) ;; CHECK kind IN ('founder','qa','fixture','customer','unknown') ;; FK user_id -> auth.users(id) CASCADE

### impact_narratives (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | hero_narrative text! | footprint_insight text! | content_insight text! | post_insight text! | one_action text! | data_hash text | generated_at timestamptz =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### import_jobs (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | import_type text! ='csv' | filename text | status text! ='pending' | total_rows integer! =0 | imported_rows integer! =0 | skipped_rows integer! =0 | duplicate_rows integer! =0 | error_details jsonb ='[]' | started_at timestamptz | completed_at timestamptz | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### imprint_snapshots (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | imprint numeric! | components jsonb! ='{}' | facet_vector jsonb! ='{}' | formula_version integer! =1 | created_at timestamptz! =now() | tier text
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### industry_trends (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | headline text! | insight text! | source text! | url text | published_at timestamptz | fetched_at timestamptz! =now() | status text! ='new' | canonical_url text | content_markdown text | summary text | relevance_score integer! =0 | validation_status text! ='unknown' | last_checked_at timestamptz | content_text text | validation_score integer! =0 | topic_relevance_score integer! =0 | final_score numeric! =0 | rejection_reason text | selection_reason text | category text | impact_level text | confidence_level text | opportunity_type text | action_recommendation text | content_angle text | signal_type text | snapshot_quality integer! =0 | is_valid boolean! =true | decision_label text | content_raw text | content_clean text | content_quality_score integer! =0
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE
`fetched_at` also drives fair rotation in the `fetch-industry-trends` cron (oldest served first).

### influence_snapshots (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | snapshot_date date! =CURRENT_DATE | followers integer | follower_growth integer! =0 | engagement_rate numeric! =0 | top_format text | top_topic text | authority_themes jsonb! ='[]' | audience_breakdown jsonb! ='{}' | recommendations jsonb! ='[]' | created_at timestamptz! =now() | tone_analysis jsonb! ='[]' | format_breakdown jsonb! ='{}' | post_count integer! =0 | authority_trajectory text | impressions integer! =0 | reactions integer! =0 | comments integer! =0 | shares integer! =0 | saves integer! =0 | posts_count integer! =0 | source_type text! ='unknown' | members_reached integer | total_impressions_annual integer
C: PK (id) ;; UNIQUE (user_id, snapshot_date, source_type) ;; FK user_id -> auth.users(id) CASCADE

### instrument_runs (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | kind text! ='assessment' | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE. Counted against `LIMITS.INSTRUMENT_RUNS_PER_ACCOUNT`.

### job_queue (RLS ON)
id uuid! =gen_random_uuid() | job_type text! | user_id uuid | payload jsonb! ='{}' | status text! ='pending' | priority integer! =0 | attempts integer! =0 | max_attempts integer! =3 | claimed_at timestamptz | claimed_by text | scheduled_for timestamptz! =now() | last_error text | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; CHECK status IN ('pending','claimed','done','failed','dead') ;; FK user_id -> auth.users(id) SET NULL
Claimed with `claim_job(p_job_type, p_worker)`, closed with `complete_job(p_id, p_success, p_error)`.

### known_issues (RLS ON)
id uuid! =gen_random_uuid() | title text! | detail text | severity text! | status text! ='open' | area text | trigger_note text | detected_at timestamptz! =now() | resolved_at timestamptz | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; CHECK severity IN ('low','medium','high') ;; CHECK status IN ('open','monitoring','resolved')

### learned_intelligence (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | source_entry_id uuid | source_document_id uuid | intelligence_type text! ='framework' | title text! | content text! | skill_pillars text[]! ='{}' | skill_boost_pct numeric! =3 | tags text[]! ='{}' | embedding vector(1536) | tsv tsvector | created_at timestamptz! =now()
C: PK (id) ;; FK source_document_id -> documents(id) SET NULL ;; FK source_entry_id -> entries(id) SET NULL ;; FK user_id -> auth.users(id) CASCADE

### lifecycle_email_log (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | message_key text! | sent_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, message_key) — the send-once guarantee ;; FK user_id CASCADE

### lifecycle_emails (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | email_type text! | sent_at timestamptz =now() | metadata jsonb ='{}'
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### linkedin_connections (RLS ON)  — holds OAuth tokens; never expose directly
id uuid! =gen_random_uuid() | user_id uuid! | linkedin_id text | display_name text | access_token text! | refresh_token text | token_expires_at timestamptz | scopes text[] ='{}' | connected_at timestamptz =now() | last_synced_at timestamptz | status text! ='active' | created_at timestamptz =now() | updated_at timestamptz =now() | handle text | profile_name text | profile_url text | source_status text! ='unknown' | timezone text | claim_token_hash text | followers_total integer | followers_total_at timestamptz | can_post boolean | post_checked_at timestamptz | post_check_error text
C: PK (id) ;; CHECK handle ~ '^[A-Za-z0-9][A-Za-z0-9-]{1,99}$' ;; FK user_id -> auth.users(id) CASCADE
The client reads the token-free view `linkedin_connections_safe`, never this table.

### linkedin_connections_guessed_20260812 (RLS ON)
Dated archive of rows whose handle was inferred rather than claimed. No constraints.

### linkedin_post_metrics (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | post_id uuid! | snapshot_date date! =CURRENT_DATE | impressions integer! =0 | reactions integer! =0 | comments integer! =0 | shares integer! =0 | saves integer! =0 | engagement_rate numeric! =0 | created_at timestamptz! =now() | source_type text! ='manual' | members_reached integer! =0 | sends integer! =0 | link_clicks integer! =0 | profile_views integer! =0 | followers_gained integer! =0
C: PK (id) ;; UNIQUE (post_id, snapshot_date) ;; FK post_id -> linkedin_posts(id) CASCADE ;; FK user_id CASCADE

### linkedin_posts (RLS ON)  — 61 columns, the post ledger
id uuid! =gen_random_uuid() | user_id uuid! | linkedin_post_id text | post_text text | created_at timestamptz! =now() | published_at timestamptz | like_count integer! =0 | comment_count integer! =0 | repost_count integer! =0 | engagement_score numeric! =0 | media_type text ='text' | theme text | tone text | format_type text | synced_at timestamptz! =now() | post_url text | title text | hook text | topic_label text | framework_type text | visual_style text | content_type text | carousel_structure_type text | hook_style text | cta_style text | content_engine_output_type text | visual_strategy_type text | tracking_status text! ='discovered' | rejection_reason text | source_type text! ='search_discovery' | source_metadata jsonb! ='{}' | enriched_by text[]! ='{}' | source_trust integer! =1 | source_signal_id uuid | published_confirmed_at timestamptz | linkedin_url text | quality_score jsonb | authorship text! ='unset' | acquisition text! ='unset' | claimed_at timestamptz | publish_attempted_at timestamptz | original_generated_text text | ending_type text | stance text | moment_id uuid | voice_match numeric | unsourced_numbers_removed integer! =0 | edited_at timestamptz | edit_distance numeric | unsourced_entities_removed integer! =0 | voice_corpus_status text ='included' | voice_corpus_reason text | made_by text! ='unknown' | arrived_by text! ='unknown' | confidence text! ='unknown' | produced_by text | prompt_version text | model_used text | text_is_snippet boolean! =false | embedding vector(1536) | tsv tsvector
C: PK (id) ;; UNIQUE (user_id, linkedin_post_id) ;; FK user_id CASCADE ;; FK source_signal_id -> strategic_signals(id)
  CHECK acquisition IN ('published_via_aura','imported','discovered','api_synced','unset')
  CHECK arrived_by IN ('published_through_aura','imported_by_member','discovered_by_search','entered_by_member','generated_in_place','unknown')
  CHECK authorship IN ('user_written','aura_drafted','aura_assisted','unknown','unset')
  CHECK confidence IN ('confirmed','reported','guessed','unknown')
  CHECK made_by IN ('member','aura','aura_edited_by_member','machine','unknown')
  CHECK produced_by IN ('composer','weekly_drafts','overnight_agent','carousel_studio')
  CHECK ending_type IN ('question','suspended','reframe','equation','number','cta','other')
  CHECK hook_style IN ('contrarian_claim','number_first','short_story','question','experience_led','announcement','other')
  CHECK stance IN ('asserts','story','teaches','doubts','analysis')
  CHECK voice_corpus_status IN ('included','excluded','auto_excluded')
Trigger `enforce_published_authorship` guards the published/authorship combination.

### linkedin_profile_snapshots (RLS ON)  — append-only, one row per read
id uuid! =gen_random_uuid() | user_id uuid! | fetched_at timestamptz! =now() | full_name text | headline text | about text | photo_url text | location text | followers integer | connections integer | experience jsonb | education jsonb | skills jsonb | languages jsonb | certifications jsonb | raw jsonb | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE. INSERT only — never upsert (profile-destruction rule).

### linkedin_profile_snapshots_backup_20260821 (RLS ON)
Dated backup of the above. No constraints.

### market_mirror_cache (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | headhunter_text text | client_cio_text text | curator_text text | gaps jsonb | generated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id) ;; FK user_id -> auth.users(id) CASCADE

### master_frameworks (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | entry_id uuid | title text! | source_type text! ='capture' | framework_steps jsonb! ='[]' | summary text | tags text[]! ='{}' | created_at timestamptz! =now() | updated_at timestamptz! =now() | diagram_url text | diagram_description jsonb ='{}'
C: PK (id) ;; FK entry_id -> entries(id) SET NULL ;; FK user_id -> auth.users(id) CASCADE

### member_issue_reports (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | kind text! | message text! | route text | component_stack text | user_agent text | app_version text | created_at timestamptz! =now()
C: PK (id) ;; CHECK kind IN ('crash','feedback') ;; FK user_id -> auth.users(id) CASCADE
Written by the service-role `report-issue` function; members cannot select from it.

### metric_targets (RLS ON)
id uuid! =gen_random_uuid() | metric_key text! | target_value numeric! | target_by date! | baseline_value numeric | baseline_on date | rationale text! | status text! ='active' | reviewed_on date | review_note text | set_on date! =(now() AT TIME ZONE 'utc')::date | created_at timestamptz! =now()
C: PK (id) ;; CHECK status IN ('active','kept','revised','dropped')

### mirror_reads (RLS ON)  — anonymous public read cache, keyed by handle
handle text! | canonical_url text! | read jsonb! | sparse boolean! =false | generated_at timestamptz! =now() | hit_count integer! =1 | name text | posts_read integer | read_version smallint! =1 | emailed_at timestamptz | emailed_to text | avatar_url text | headline text
C: PK (handle)

### mirror_requests (RLS ON)
id uuid! =gen_random_uuid() | ip_hash text! | handle text | email text | created_at timestamptz! =now() | ref text | status text! ='ok'

### narrative_suggestions (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | topic text! | angle text! ='' | recommended_format text! ='post' | reason text! ='' | source_signal_id uuid | status text! ='suggested' | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### notification_events (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | type text! | channel text! | title text! | body text | metadata jsonb ='{}' | read boolean =false | acted_on boolean =false | sent_at timestamptz =now() | read_at timestamptz | expires_at timestamptz
C: PK (id) ;; CHECK channel IN ('inapp','email','whatsapp','push') ;; CHECK type IN ('timing_window','silence_alarm','signal_shift','weekly_brief','knowledge_debt','morning_signal','member_reminder') ;; FK user_id CASCADE

### notifications (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | title text! | body text! | type text! ='progress' | read boolean! =false | metadata jsonb ='{}' | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### onboarding_article_log (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | sector_focus text | core_practice text | outcome text! | url text | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### onboarding_questions (RLS ON)  — reference data, seeded
id uuid! =gen_random_uuid() | band seniority_band! | sector text | position smallint! | prompt text! | helper text | options jsonb | active boolean! =true | created_at timestamptz! =now() | kind text! ='choice' | max_choices smallint | framework text | feeds text | why_asked text | allow_none boolean! =true | randomise boolean! =true | instrument_version smallint! =2
C: PK (id) ;; CHECK kind IN ('choice','multi','text','proposed')

### operation_runs (RLS ON)  — realtime progress spine for WorkingPanel
id uuid! =gen_random_uuid() | operation text! | started_at timestamptz! =now() | finished_at timestamptz | outcome text | reason_code text | attempt integer! =1 | user_id uuid | anon_token text | fingerprint_hash text | cost_usd numeric | meta jsonb! ='{}' | stages jsonb! ='[]'
C: PK (id) ;; FK user_id -> auth.users(id) SET NULL
`stages` is appended at real provider/model boundaries; the client subscribes by client-run id.
Read anonymously with `get_run_stages(p_run_id, p_anon_token)`.

### ops_alerts (RLS ON)
id uuid! =gen_random_uuid() | created_at timestamptz! =now() | subject text | body text | severity text | source text | emailed boolean! =false | what text | impact text | action text | status text! ='open' | resolved_at timestamptz | last_seen timestamptz =now() | occurrences integer! =1 | last_emailed timestamptz
C: PK (id)

### output_leak_log (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | function_name text | language text | leak_stage text | first_lines text | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) SET NULL. Records prompt/preamble leaks caught by gates.

### page_backgrounds (RLS ON)
id uuid! =gen_random_uuid() | page_key text! | theme text! ='both' | image_url text | gradient_overlay text =(dark paper gradient) | tint_color text | opacity numeric =0.07 | position text ='center' | enabled boolean =true | created_at timestamptz =now() | updated_at timestamptz =now()
C: PK (id) ;; UNIQUE (page_key, theme). Admin appearance settings.

### post_events (RLS ON)
id uuid! =gen_random_uuid() | post_id uuid! | user_id uuid! | event text! | at timestamptz! =now() | actor text! | details jsonb! ='{}'
C: PK (id) ;; UNIQUE (post_id, event, at) ;; CHECK actor IN ('aura','member','system','linkedin') ;; CHECK event IN ('drafted','edited','scheduled','publish_attempted','published','discarded','metrics_synced') ;; FK post_id -> linkedin_posts(id) CASCADE ;; FK user_id CASCADE

### product_events (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | event text! | props jsonb! ='{}' | session_id text | occurred_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### product_facts (RLS ON)  — what Your Desk is allowed to claim the product does
id uuid! =gen_random_uuid() | key text! | title text! | body text! | category text! | active boolean! =true | sort_order integer! =100 | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (key) ;; CHECK category IN ('surface','score','capability','limit'). Seed data.

### profile_copy_drafts (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | target text! | options jsonb! | language text | posts_used integer | created_at timestamptz! =now() | updated_at timestamptz! =now() | copied_at timestamptz | copied_text text | copied_angle text | applied_at timestamptz | source_headline text | source_about text
C: PK (id) ;; UNIQUE (user_id, target) ;; CHECK target IN ('headline','about') ;; FK user_id CASCADE

### qa_audit_results (RLS ON)
id uuid! =gen_random_uuid() | run_at timestamptz =now() | run_by uuid | layer text! | category text! | test_id text! | test_name text! | status text! | details jsonb | run_id uuid!
C: PK (id) ;; FK run_by -> auth.users(id) SET NULL

### qa_reports (RLS ON)
id uuid! =gen_random_uuid() | run_at timestamptz =now() | total_checks integer | passed integer | failed integer | results jsonb | triggered_by text ='manual'
C: PK (id)

### qa_runs (RLS ON)
id uuid! =gen_random_uuid() | run_at timestamptz! =now() | check_key text! | status text! | detail text | value_json jsonb! ='{}'
C: PK (id) ;; CHECK status IN ('pass','fail','warn')

### read_queue (RLS ON)
id uuid! =gen_random_uuid() | email text! | requested_at timestamptz! =now() | operation text! ='linkedin_read' | fingerprint_hash text | anon_token text | notified_at timestamptz
C: PK (id). Fills when the daily instrument-run ceiling is reached (see `_shared/limits.ts`).

### recommended_moves_retired_20260718 (RLS ON)
Retired moves table. Superseded by `strategic_signals` + `narrative_suggestions`.

### register_options (RLS ON)
id uuid! =gen_random_uuid() | label text! | language text | sort_order integer | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (label). Reference data for target register choice.

### report_shares (RLS ON)  — public share tokens for a read
token text! | user_id uuid! | headline text | archetype text | market_read text | subjects jsonb ='[]' | own_words text | lang text ='en' | display_name text | views integer! =0 | revoked_at timestamptz | created_at timestamptz! =now()
C: PK (token) ;; FK user_id -> auth.users(id) CASCADE. Public reads go through `get_shared_read(p_token)`.

### report_snapshots (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | version integer! | data jsonb! | is_current boolean! =true | created_by text! ='system' | created_at timestamptz! =now()
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### request_snapshots (RLS ON)
id bigint! =nextval(...) | response_id bigint | requested_at timestamptz | status_code integer | error_msg text | url text | failure_kind text | captured_at timestamptz! =now()
C: PK (id) ;; UNIQUE (response_id). Filled by `capture_request_snapshots()` from pg_net history.

### retrieval_logs (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | caller text! | query text | query_len integer | result_count integer | kinds jsonb | top_rank real | degraded boolean! =false | error text | latency_ms integer | pipeline_version smallint! =1 | created_at timestamptz! =now()
C: PK (id). Every `search_vault` call from chat-aura / ask-aura logs here.

### score_snapshots (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | score integer! =0 | components jsonb! ='{}' | created_at timestamptz! =now() | tier text
C: PK (id) ;; FK user_id -> auth.users(id) CASCADE

### seniority_titles (RLS ON)
title text! | band seniority_band! | position smallint! | active boolean! =true
C: PK (title). Reference data behind `detect_seniority_band(headline)`.

### ship_markers (RLS ON)
id uuid! =gen_random_uuid() | shipped_on date! | title text! | notes text | created_at timestamptz! =now()
C: PK (id)

### signal_engagements (RLS ON)
user_id uuid! | signal_id uuid! | open_count integer! =0 | last_opened_at timestamptz! =now() | created_at timestamptz! =now()
C: PK (user_id, signal_id) ;; FK user_id CASCADE. Bumped by `bump_signal_engagement(p_signal_id)`.

### signal_topic_preferences (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | theme_tag text! | preference_score double precision =0.0 | updated_at timestamptz =now()
C: PK (id) ;; UNIQUE (user_id, theme_tag) ;; FK user_id CASCADE

### signature_events (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | family text | lang text | action text! | payload jsonb | created_at timestamptz! =now()
C: PK (id) ;; CHECK action IN ('suggested','picked','edited','exported','published') ;; FK user_id CASCADE
The Signatures feature was removed from the UI; the table remains as history.

### signup_attempts (RLS ON)
id uuid! =gen_random_uuid() | ip_hash text! | email_hash text | created_at timestamptz! =now()
C: PK (id). Rate limiting — see `LIMITS.SIGNUPS_PER_IP_PER_DAY`.

### signup_ceiling_alerts (RLS ON)
ip_hash text! | last_sent_at timestamptz! =now()
C: PK (ip_hash)

### signup_refusals (RLS ON)
id uuid! =gen_random_uuid() | ip_hash text | code text! | created_at timestamptz! =now()
C: PK (id)

### skill_targets (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | pillar text! | target_hours numeric(7,2)! =100 | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, pillar) ;; FK user_id CASCADE

### source_events (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | event_type text! | source_table text! | source_id uuid! | occurred_at timestamptz! =now() | payload jsonb! ='{}' | processed_at timestamptz | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, source_table, source_id, event_type) ;; FK user_id CASCADE
The idempotent fan-in point of the unified capture pipeline.

### source_registry (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | source_type text! | source_id uuid! | title text | content_preview text | source_metadata jsonb ='{}' | processed boolean! =false | processed_at timestamptz | fragment_count integer! =0 | created_at timestamptz! =now() | updated_at timestamptz! =now() | signal_status text
C: PK (id) ;; UNIQUE (user_id, source_type, source_id) ;; FK user_id CASCADE
One row per ingested source; `evidence_fragments` hang off it.

### strategic_signals (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | signal_title text! | explanation text! | strategic_implications text! | supporting_evidence_ids uuid[]! ='{}' | theme_tags text[]! ='{}' | skill_pillars text[]! ='{}' | confidence numeric! =0.7 | fragment_count integer! =0 | framework_opportunity jsonb ='{}' | content_opportunity jsonb ='{}' | status text! ='active' | created_at timestamptz! =now() | updated_at timestamptz! =now() | consulting_opportunity jsonb ='{}' | unique_orgs integer! =1 | confidence_explanation text | what_it_means_for_you text | priority_score numeric! =0.5 | user_signal_feedback text | signal_velocity double precision | velocity_status text ='stable' | last_decay_at timestamptz | commercial_validation_score double precision | base_confidence numeric | momentum numeric | last_evidence_at timestamptz | lifecycle_tier text | strength_score numeric | pipeline_version smallint! =1 | embedding vector(1536) | tsv tsvector
C: PK (id) ;; CHECK velocity_status IN ('accelerating','stable','fading','dormant') ;; FK user_id CASCADE

### strategic_signals_orphans_20260811 (RLS ON)
Dated archive of signals whose owner rows were lost. No constraints.

### sync_errors (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | sync_run_id uuid | error_type text! ='unknown' | error_message text! | context jsonb ='{}' | created_at timestamptz! =now()
C: PK (id) ;; FK sync_run_id -> sync_runs(id) CASCADE ;; FK user_id SET NULL

### sync_runs (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid | account_id uuid | started_at timestamptz! =now() | completed_at timestamptz | status text! ='running' | records_fetched integer! =0 | records_stored integer! =0 | sync_type text! ='full' | error_message text | created_at timestamptz! =now()
C: PK (id) ;; FK account_id -> linkedin_connections(id) CASCADE ;; FK user_id SET NULL

### theme_aliases (RLS ON)
id uuid! =gen_random_uuid() | canonical text! | alias text! | locale text! ='en' | source text! ='seed' | active boolean! =true | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (alias, canonical, locale). Reference data for the shared text/matching layer.

### training_logs (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | pillar text! | duration_hours numeric(5,2)! =0 | topic text! | created_at timestamptz! =now()
C: PK (id) ;; FK user_id CASCADE

### user_milestones (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | milestone_id text! | milestone_name text! | context jsonb! ='{}' | earned_at timestamptz! =now() | acknowledged boolean! =false | shared boolean! =false
C: PK (id) ;; UNIQUE (user_id, milestone_id) ;; FK user_id CASCADE

### user_roles (RLS ON)  — the ONLY place roles live
id uuid! =gen_random_uuid() | user_id uuid! | role app_role! | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, role) ;; FK user_id CASCADE
Never store a role on a profile row. Check with `has_role(uuid, app_role)` (SECURITY DEFINER).

### user_widget_layout (RLS ON)
user_id uuid! | layout jsonb! ='{}' | updated_at timestamptz! =now()
C: PK (user_id) ;; FK user_id CASCADE

### voice_distribution (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | language text! | corpus_n integer! =0 | computed_at timestamptz! =now() | open_type_share jsonb | land_type_share jsonb | move_share jsonb | marker_rate jsonb | length_p25 integer | length_p50 integer | length_p75 integer | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, language) ;; FK user_id CASCADE

### voice_feedback (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | profile_id uuid | post_id uuid | sample_text text | verdict text! | applied_changes jsonb! ='[]' | mode_scope text | created_at timestamptz! =now()
C: PK (id) ;; CHECK verdict IN ('sounds_like_me','partly','not_me','too_formal','too_generic','too_aggressive','would_never_say') ;; FK post_id -> linkedin_posts(id) SET NULL ;; FK user_id CASCADE

### voice_learning_prefs (RLS ON)
user_id uuid! | learn_from_performance boolean! =true | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (user_id) ;; FK user_id CASCADE

### voice_post_outcomes (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | post_id uuid! | published_at timestamptz | followers_at_publish integer | impressions integer | engagement_rate numeric | reactions integer | comments integer | shares integer | performance_index numeric | performance_index_raw numeric | baseline_engagement_rate numeric | sample_traits jsonb! ='{}' | hook_style text | ending_type text | computed_at timestamptz! =now() | excluded boolean! =false | exclusion_reason text | created_at timestamptz! =now() | updated_at timestamptz! =now() | outcome_source text | total_engagement integer | baseline_total_engagement numeric
C: PK (id) ;; UNIQUE (post_id) ;; CHECK outcome_source IN ('metrics_snapshot','post_counts') ;; FK post_id CASCADE ;; FK user_id CASCADE

### voice_rules (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | profile_id uuid | kind text! | text text! | source text! ='user' | rank integer! =0 | active boolean! =true | created_at timestamptz! =now() | updated_at timestamptz! =now() | status text! ='active' | evidence jsonb | suggested_at timestamptz | decided_at timestamptz | check jsonb | last_applied_at timestamptz | times_applied integer! =0
C: PK (id) ;; CHECK kind IN ('always','never','anchor') ;; CHECK source IN ('learned','user','aura') ;; CHECK status IN ('suggested','active','dismissed') ;; CHECK check is an object with kind IN ('phrase','opening','ending','marker') and non-empty value ;; FK profile_id -> authority_voice_profiles(id) CASCADE ;; FK user_id CASCADE
`increment_voice_rule_applied(p_rule_id, p_applied_at)` maintains the applied counters.

### voice_trait_registry (RLS ON)
id uuid! =gen_random_uuid() | trait_key text! | display_name text! | pole_low text! | pole_high text! | group_key text! | unit text | computable boolean! =true | min_evidence integer! =8 | sort_order integer! =0 | active boolean! =true | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (trait_key) ;; CHECK group_key IN ('sound','structure','language'). Reference data.

### voice_trait_rejections (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | profile_id uuid! | trait_key text! | rejected_value numeric | rejected_until timestamptz! =(now() + 30 days) | created_at timestamptz! =now()
C: PK (id) ;; FK profile_id CASCADE ;; FK user_id CASCADE

### voice_traits (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | profile_id uuid! | trait_key text! | value numeric! | band_low numeric | band_high numeric | raw_value numeric | confidence text! | source text! | evidence_count integer! =0 | locked boolean! =false | last_confirmed_at timestamptz | computed_at timestamptz | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (profile_id, trait_key) ;; CHECK value BETWEEN 0 AND 100 ;; CHECK confidence IN ('low','medium','high') ;; CHECK source IN ('learned','user','aura') ;; FK trait_key -> voice_trait_registry(trait_key) ;; FK profile_id CASCADE ;; FK user_id CASCADE

### weekly_missions (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | mission_type text! | title text! | description text | points integer =5 | status text ='pending' | completed_at timestamptz | expires_at timestamptz | metadata jsonb ='{}' | created_at timestamptz =now()
C: PK (id) ;; CHECK mission_type IN ('signal','content','rhythm','voice','baseline') ;; CHECK status IN ('pending','completed','expired') ;; FK user_id CASCADE

### whatsapp_links (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | phone_e164 text | pair_token text | token_expires_at timestamptz | status text! ='pending' | bound_at timestamptz | last_message_at timestamptz | created_at timestamptz! =now() | updated_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id), (pair_token), (phone_e164) ;; CHECK status IN ('pending','active') ;; FK user_id CASCADE

### whatsapp_messages (RLS ON)
id uuid! =gen_random_uuid() | wa_message_id text! | user_id uuid | from_phone text | body text | kind text | entry_id uuid | result text | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (wa_message_id) ;; FK user_id SET NULL

### widget_slot_votes (RLS ON)
id uuid! =gen_random_uuid() | user_id uuid! | slot_key text! | created_at timestamptz! =now()
C: PK (id) ;; UNIQUE (user_id, slot_key) ;; FK user_id CASCADE

## Relationships (ERD in words)

`auth.users(id)` is the hub. Almost every table carries `user_id uuid` with
`ON DELETE CASCADE` (a few operational/log tables use `SET NULL` so history survives account
deletion: `ai_usage_log`, `agent_findings`, `ef_error_log`, `eval_metrics`, `operation_runs`,
`output_leak_log`, `sync_runs`, `sync_errors`, `whatsapp_messages`, `beta_allowlist`,
`design_system`, `qa_audit_results`, `job_queue`, `learned_intelligence` sources).

Non-user foreign keys, i.e. the real graph:

```text
documents ──< document_chunks
documents ──< document_jobs
documents ──< document_briefs
documents ──< learned_intelligence.source_document_id (SET NULL)
entries   ──< learned_intelligence.source_entry_id   (SET NULL)
entries   ──< master_frameworks.entry_id             (SET NULL)
source_registry ──< evidence_fragments
strategic_signals ──< content_items.signal_id        (SET NULL)
strategic_signals ──< linkedin_posts.source_signal_id
linkedin_posts ──< linkedin_post_metrics
linkedin_posts ──< post_events
linkedin_posts ──< voice_post_outcomes (1:1 via UNIQUE post_id)
linkedin_posts ──< voice_feedback.post_id            (SET NULL)
linkedin_connections ──< sync_runs.account_id
sync_runs ──< sync_errors
master_frameworks ──< framework_activations
capability_dimensions ──< capability_responses
authority_voice_profiles ──< voice_rules, voice_traits, voice_trait_rejections
voice_trait_registry(trait_key) ──< voice_traits.trait_key
chat_conversations ──< chat_messages
desk_eval_questions ──< desk_eval_runs
```

`content_lineage` is a soft join table: `(content_table, content_id)` points at either
`linkedin_posts` or `content_items`, `(contributor_kind, contributor_id)` at the thing that
contributed. It has no FKs on purpose so contributors can be deleted without losing the record.

## Triggers (39)

```text
beta_allowlist.update_beta_allowlist_updated_at -> update_updated_at_column (BEFORE UPDATE)
capability_responses.capability_responses_touch -> touch_capability_response (BEFORE INSERT/UPDATE)
chat_conversations.set_updated_at_chat_conversations -> update_updated_at_column (BEFORE UPDATE)
content_items.content_items_tsv_update -> content_items_tsv_trigger (BEFORE INSERT/UPDATE)
content_items.update_content_items_updated_at -> update_updated_at_column (BEFORE UPDATE)
daily_brief_snapshots.daily_brief_snapshots_no_mutation -> daily_brief_snapshots_immutable (BEFORE DELETE/UPDATE)
decks.decks_set_updated_at -> update_updated_at_column (BEFORE UPDATE)
desk_learning.desk_learning_updated_at -> update_updated_at_column (BEFORE UPDATE)
diagnostic_profiles.diagnostic_profiles_guard_billing -> guard_profile_billing_columns (BEFORE UPDATE)
diagnostic_profiles.grant_member_role_on_profile_trigger -> grant_member_role_on_profile (AFTER INSERT)
diagnostic_profiles.guard_account_type_changes -> guard_account_type_changes (BEFORE UPDATE)
diagnostic_profiles.sync_tier_from_plan -> sync_tier_from_plan (BEFORE INSERT/UPDATE)
document_briefs.document_briefs_tsv_update -> document_briefs_tsv_trigger (BEFORE INSERT/UPDATE)
entries.update_entries_updated_at -> update_updated_at_column (BEFORE UPDATE)
evidence_fragments.evidence_fragments_tsv_update -> evidence_fragments_tsv_trigger (BEFORE INSERT/UPDATE)
facet_states.facet_states_set_updated_at -> set_updated_at_facet_states (BEFORE UPDATE)
guide_articles.update_guide_articles_updated_at -> update_updated_at_column (BEFORE UPDATE)
health_findings.trg_health_findings_updated_at -> update_updated_at_column (BEFORE UPDATE)
job_queue.job_queue_set_updated_at -> update_updated_at_column (BEFORE UPDATE)
known_issues.known_issues_set_updated_at -> update_updated_at_column (BEFORE UPDATE)
learned_intelligence.learned_intelligence_tsv_update -> learned_intelligence_tsv_trigger (BEFORE INSERT/UPDATE)
linkedin_posts.linkedin_posts_tsv_update -> linkedin_posts_tsv_trigger (BEFORE INSERT/UPDATE)
linkedin_posts.trg_linkedin_posts_authorship_guard -> enforce_published_authorship (BEFORE INSERT/UPDATE)
linkedin_posts.trg_record_post_event -> record_post_event (AFTER INSERT/UPDATE)
linkedin_profile_snapshots.update_..._updated_at -> update_updated_at_column (BEFORE UPDATE)
product_facts.product_facts_updated_at -> update_updated_at_column (BEFORE UPDATE)
profile_copy_drafts.update_..._updated_at -> update_updated_at_column (BEFORE UPDATE)
recommended_moves_retired_20260718.update_..._updated_at -> update_updated_at_column (BEFORE UPDATE)
skill_targets.update_skill_targets_updated_at -> update_updated_at_column (BEFORE UPDATE)
strategic_signals.strategic_signals_tsv_update -> strategic_signals_tsv_trigger (BEFORE INSERT/UPDATE)
strategic_signals.trg_notify_first_signal -> notify_first_signal (AFTER INSERT)
strategic_signals.update_strategic_signals_updated_at -> update_updated_at_column (BEFORE UPDATE)
theme_aliases.theme_aliases_reject_stopword -> reject_stopword_alias (BEFORE INSERT/UPDATE)
voice_distribution.update_..._updated_at -> update_updated_at_column (BEFORE UPDATE)
voice_learning_prefs.update_..._updated_at -> update_updated_at_column (BEFORE UPDATE)
voice_post_outcomes.update_..._updated_at -> update_updated_at_column (BEFORE UPDATE)
voice_rules.voice_rules_updated_at -> update_updated_at_column (BEFORE UPDATE)
voice_traits.update_voice_traits_updated_at -> update_updated_at_column (BEFORE UPDATE)
whatsapp_links.update_whatsapp_links_updated_at -> update_updated_at_column (BEFORE UPDATE)
```

The behaviour-carrying ones (not just `updated_at`):

- `touch_capability_response` — stamps `answered_at` from the **database** clock; the browser must
  never send a timestamp.
- `daily_brief_snapshots_immutable` — blocks UPDATE and DELETE; the brief history is append-only.
- `guard_profile_billing_columns` — reverts client writes to `plan`, `tier`, `account_type`,
  `plan_source`, `trial_ends_at`, `excluded_at`, `excluded_reason`. Only service role / admin passes.
- `guard_account_type_changes` — same idea for `account_type` transitions.
- `sync_tier_from_plan` — keeps the legacy `tier` column consistent with `plan`.
- `grant_member_role_on_profile` — inserts the `member` row in `user_roles` when a profile appears.
- `enforce_published_authorship` — a post may not be marked published without honest authorship.
- `record_post_event` — writes the matching `post_events` row on state change.
- `notify_first_signal` — fires the first-signal notification.
- `reject_stopword_alias` — refuses a `theme_aliases` alias that is only a stop word.
- `*_tsv_trigger` — maintains the full-text `tsv` column used by `search_vault`.

## Database functions

Signatures below are exact. `[SECDEF]` = `SECURITY DEFINER` (runs with owner privileges and is the
supported way to read across RLS). Anything not marked is `SECURITY INVOKER`.

```text
_clone_member_rows(p_table text, p_donor uuid, p_target uuid, p_limit integer, p_overrides jsonb DEFAULT '{}') -> integer [SECDEF]
activate_design_version(p_new_tokens jsonb, p_created_by uuid DEFAULT <founder uuid>) -> uuid [SECDEF]
admin_cohorts() -> TABLE(cohort_week date, size int, captured int, got_signal int, linkedin_live int, opened_writer int, has_draft int, published int) [SECDEF]
admin_cron_failures_24h() -> TABLE(jobname text, failed int, last_fail timestamptz) [SECDEF]
admin_economics_denominators() -> TABLE(active_users int, published_posts int, signals_delivered int) [SECDEF]
admin_list_crons() -> TABLE(jobid bigint, jobname text, schedule text, active boolean, last_status text, last_start timestamptz, last_msg text) [SECDEF]
admin_run_cron(p_jobid bigint) -> text [SECDEF]
admin_spend_by_function(p_months_back int DEFAULT 0) -> TABLE(function_name text, spend numeric, calls int) [SECDEF]
admin_spend_daily(p_days int DEFAULT 30) -> TABLE(day date, spend numeric) [SECDEF]
admin_stage_timeline(p_days int DEFAULT 90) -> TABLE(day date, signed_up int, finished_setup int, captured int, got_signal int, linkedin_live int, opened_writer int, has_draft int, published int) [SECDEF]
brief_history(days int DEFAULT 30) -> TABLE(brief_date date, runs int, sent boolean, funnel jsonb) [SECDEF]
bump_signal_engagement(p_signal_id uuid) -> void [SECDEF]
capture_request_snapshots() -> integer [SECDEF]
check_invite_token(p_token text) -> jsonb [SECDEF]
claim_assessment_session(p_token text) -> uuid [SECDEF]
claim_job(p_job_type text, p_worker text) -> SETOF job_queue [SECDEF]
classify_request_failure(p_status integer, p_error text) -> text
cockpit_freshness() -> TABLE(check_key text, claim text, last_row_at timestamptz, hours_stale numeric, state text) [SECDEF]
complete_job(p_id uuid, p_success boolean, p_error text DEFAULT NULL) -> void [SECDEF]
content_items_tsv_trigger() -> trigger
create_assessment_session(p_ip_hash text DEFAULT NULL) -> text [SECDEF]
daily_brief_snapshots_immutable() -> trigger
decisions_due(p_on date DEFAULT NULL) -> TABLE(...) [SECDEF]
delete_account(p_user_id uuid) -> void [SECDEF]
detect_seniority_band(headline text) -> seniority_band
document_briefs_tsv_trigger() -> trigger
email_crons_ran_without_sends(p_hours int DEFAULT 24) -> TABLE(crons_ran int, rows_added int, ran_jobs text[]) [SECDEF]
enforce_published_authorship() -> trigger [SECDEF]
enqueue_voice_distill_jobs() -> integer [SECDEF]
ensure_diagnostic_profile() -> trigger [SECDEF]
evidence_fragments_tsv_trigger() -> trigger
excluded_user_ids() -> TABLE(user_id uuid) [SECDEF]
founder_brief_data() -> jsonb [SECDEF]
founder_brief_user_ids() -> TABLE(user_id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz) [SECDEF]
founder_brief_verify() -> jsonb [SECDEF]
founding_reservations() -> TABLE(claimed int, cap int) [SECDEF]
founding_seats() -> TABLE(claimed int, cap int) [SECDEF]
get_assessment_session(p_token text) -> TABLE(id uuid, created_at timestamptz, expires_at timestamptz, runs_started int, state jsonb) [SECDEF]
get_run_stages(p_run_id uuid, p_anon_token text DEFAULT NULL) -> jsonb [SECDEF]
get_shared_read(p_token text) -> TABLE(headline text, archetype text, market_read text, subjects jsonb, own_words text, lang text, display_name text) [SECDEF]
grant_member_role_on_profile() -> trigger [SECDEF]
guard_account_type_changes() -> trigger [SECDEF]
guard_profile_billing_columns() -> trigger [SECDEF]
has_role(_user_id uuid, _role app_role) -> boolean [SECDEF]
home_record_themes(p_from date, p_to date, p_uid uuid DEFAULT NULL, p_tz text DEFAULT 'UTC') -> TABLE(id uuid, title text, created_at timestamptz) [SECDEF]
home_record_timeline(p_uid uuid DEFAULT NULL, p_tz text DEFAULT 'UTC') -> jsonb [SECDEF]
identity_kind(p_user_id uuid) -> text [SECDEF]
increment_voice_rule_applied(p_rule_id uuid, p_applied_at timestamptz DEFAULT now()) -> void [SECDEF]
is_current_user_admin() -> boolean [SECDEF]
is_customer(p_user_id uuid) -> boolean [SECDEF]
join_read_queue(p_email text, p_operation text DEFAULT 'linkedin_read', p_anon_token text DEFAULT NULL, p_fingerprint_hash text DEFAULT NULL) -> integer [SECDEF]
```

```text
learned_intelligence_tsv_trigger() -> trigger
linkedin_handle_valid(h text) -> boolean
linkedin_posts_tsv_trigger() -> trigger
momentum_funnel() -> TABLE(captures int, used_in_signal int, signals int, published int, published_through_aura int, published_live int, published_sent_from_aura int) [SECDEF]
normalise_linkedin_handle(p_raw text) -> text
notify_first_signal() -> trigger [SECDEF]
ops_cron_status(p_hours int DEFAULT 24) -> TABLE(jobid bigint, jobname text, schedule text, active boolean, last_end timestamptz, last_status text, succeeded_24h int, failed_24h int) [SECDEF]
ops_health_findings_summary(p_hours int DEFAULT 24) -> TABLE(open_count int, newest_title text, newest_at timestamptz) [SECDEF]
pending_capture_entries(p_limit int DEFAULT 25, p_min_age_minutes int DEFAULT 10, p_max_attempts int DEFAULT 3) -> TABLE(id uuid, user_id uuid, extract_attempts int) [SECDEF]
posts_attribution() -> TABLE(total bigint, member bigint, aura bigint, machine bigint, unknown bigint) [SECDEF]
publish_invariants() -> jsonb [SECDEF]
purge_expired_assessment_sessions() -> integer [SECDEF]
qa_cron_success_jobs(p_hours int) -> TABLE(jobname text, runs int, last_end timestamptz) [SECDEF]
recent_cron_http_failures(p_minutes int DEFAULT 90) -> TABLE(status_code int, failures bigint, sample_error text) [SECDEF]
reconcile_signal_counts() -> TABLE(signals_checked int, signals_fixed int, dead_ids_pruned int) [SECDEF]
record_brief_run(p_brief_date date, p_payload jsonb, p_audit jsonb, p_is_sent boolean, p_run_reason text, p_rendered_html text) -> TABLE(id uuid, run_seq int) [SECDEF]
record_guide_miss(_slug text, _surface text) -> void [SECDEF]
record_post_event() -> trigger [SECDEF]
reject_stopword_alias() -> trigger
report_invariants() -> jsonb [SECDEF]
reset_journey(p_user_id uuid DEFAULT NULL, p_wipe_captures boolean DEFAULT false) -> jsonb [SECDEF]
resolve_member_handle(p_user_id uuid) -> text [SECDEF]
rollback_design_version(p_target_version int) -> void [SECDEF]
save_assessment_session(p_token text, p_state jsonb) -> boolean [SECDEF]
search_vault(p_user_id uuid, p_query text, p_limit int DEFAULT 15, p_query_embedding vector DEFAULT NULL, p_kinds text[] DEFAULT NULL, p_candidates int DEFAULT 60)
  -> TABLE(source_kind text, source_id uuid, title text, content text, url text, occurred_at timestamptz, rank real, kw_rank real, vec_distance real, rrf real, metadata jsonb) [SECDEF]
seed_test_member(p_user_id uuid, p_persona text DEFAULT 'stranger') -> jsonb [SECDEF]
set_updated_at_facet_states() -> trigger
start_assessment_run(p_token text, p_daily_cap int DEFAULT 200) -> boolean [SECDEF]
strategic_signals_tsv_trigger() -> trigger
sync_tier_from_plan() -> trigger
tier_rank(t text) -> integer
touch_capability_response() -> trigger
undeclared_jobs() -> TABLE(jobid bigint, jobname text, schedule text) [SECDEF]
update_updated_at_column() -> trigger
voice_corpus_review(p_user_id uuid) -> TABLE(id uuid, published_at timestamptz, created_at timestamptz, excerpt text, hook_style text, counts_toward_voice boolean, source_label text, set_aside_reason text)
voice_corpus_stats(p_user_id uuid) -> TABLE(post_count int, newest_published_at timestamptz) [SECDEF]
voice_opener_diversity(p_user_id uuid) -> numeric [SECDEF]
voice_profile_readiness(p_profile_id uuid) -> text [SECDEF]
voice_top_style_share(p_user_id uuid) -> TABLE(share numeric, top_style text, top_count int, window_total int, other_dominant boolean) [SECDEF]
voice_window(p_user_id uuid) -> TABLE(id uuid, post_text text, hook_style text, ending_type text, published_at timestamptz, created_at timestamptz) [SECDEF]
```

The remaining public functions are pgvector operator/support functions installed by the `vector`
extension (`vector_*`, `halfvec_*`, `sparsevec_*`, `hnsw*`, `ivfflat*`, `cosine_distance`,
`inner_product`, `l2_distance`, `binary_quantize`, `subvector`, …). They are not application code —
do not port them by hand; `CREATE EXTENSION vector` provides them.

### The functions worth reading first

- `search_vault(...)` — the one retrieval entry point. Hybrid: full-text over `tsv` plus vector
  distance over `embedding`, fused with reciprocal rank fusion (`rrf`). Sources: entries,
  documents/chunks, document briefs, evidence fragments, strategic signals, LinkedIn posts,
  content items, learned intelligence. Always called with an explicit `p_user_id`.
- `has_role(_user_id, _role)` / `is_current_user_admin()` — the only admin checks. Never read a role
  from the client.
- `delete_account(p_user_id)` — the complete account deletion path used by admin and by the member.
- `reset_journey(p_user_id, p_wipe_captures)` — resets a member's journey for testing.
- `claim_assessment_session` / `create_assessment_session` / `save_assessment_session` /
  `get_assessment_session` / `start_assessment_run` — the anonymous assessment lifecycle.
- `get_shared_read(p_token)` — the only way the public `/r/:token` page reads a shared report.
- `resolve_member_handle` / `normalise_linkedin_handle` / `linkedin_handle_valid` — the single
  LinkedIn handle resolution path.
- `momentum_funnel()`, `publish_invariants()`, `report_invariants()`, `cockpit_freshness()` — the
  truth checks the admin cockpit renders.


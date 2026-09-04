-- 02 — tables. Columns, defaults, nullability. Constraints live in 04.
CREATE TABLE IF NOT EXISTS public._probe_resp (
  id bigint,
  status integer,
  content text,
  ts timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  actor_id uuid,
  action text NOT NULL,
  task text,
  target_user_id uuid,
  target_ref text,
  result text,
  detail jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text NOT NULL,
  value jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.agent_findings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  url text,
  title text,
  source text,
  relevance_score numeric,
  implication text,
  status text DEFAULT 'pending'::text NOT NULL,
  entry_id uuid,
  perplexity_raw jsonb,
  error_detail text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  themes text[] DEFAULT '{}'::text[] NOT NULL,
  dropped_themes text[] DEFAULT '{}'::text[] NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ai_usage_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  user_id uuid,
  function_name text NOT NULL,
  provider text NOT NULL,
  model text,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  total_tokens integer DEFAULT (COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)),
  est_cost_usd numeric(12,6) DEFAULT 0,
  success boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.api_health_checks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  results jsonb DEFAULT '[]'::jsonb NOT NULL,
  checked integer DEFAULT 0 NOT NULL,
  failed integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.assessment_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  token text NOT NULL,
  ip_hash text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  user_id uuid,
  runs_started integer DEFAULT 0 NOT NULL,
  state jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.audience_demographics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  category text NOT NULL,
  value text NOT NULL,
  percentage text NOT NULL,
  percentage_numeric numeric,
  imported_at timestamp with time zone DEFAULT now(),
  source_type text DEFAULT 'linkedin_export'::text,
  period_start date,
  period_end date,
  upload_batch_id uuid
);
CREATE TABLE IF NOT EXISTS public.audience_insights (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  insight_headline text NOT NULL,
  insight_body text NOT NULL,
  audience_strengths text[],
  audience_gaps text[],
  next_action text,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  demographics_hash text
);
CREATE TABLE IF NOT EXISTS public.audit_interpretation_backup_20260816 (
  user_id uuid,
  first_name text,
  audit_interpretation text,
  backed_up_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.aura_conversation_memory (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  session_date date DEFAULT CURRENT_DATE NOT NULL,
  summary text,
  key_decisions text[],
  topics_discussed text[],
  actions_committed text[],
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role text,
  content text,
  session_id text,
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.authority_scores (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
  authority_score numeric DEFAULT 0 NOT NULL,
  momentum_score numeric DEFAULT 0 NOT NULL,
  consistency_score numeric DEFAULT 0 NOT NULL,
  engagement_score numeric DEFAULT 0 NOT NULL,
  strategic_resonance_score numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.authority_voice_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  tone text DEFAULT ''::text NOT NULL,
  preferred_structures jsonb DEFAULT '[]'::jsonb NOT NULL,
  storytelling_patterns jsonb DEFAULT '[]'::jsonb NOT NULL,
  example_posts jsonb DEFAULT '[]'::jsonb NOT NULL,
  admired_posts jsonb DEFAULT '[]'::jsonb NOT NULL,
  vocabulary_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  language text DEFAULT 'en'::text NOT NULL,
  is_primary boolean DEFAULT true NOT NULL,
  allowed_endings text[] DEFAULT '{}'::text[] NOT NULL,
  mode_key text,
  mode_label text,
  readiness text,
  in_voice_moves text[],
  in_voice_opens text[],
  in_voice_lands text[],
  marker_style jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.beta_allowlist (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text,
  seniority text,
  sector text,
  status text DEFAULT 'pending'::text NOT NULL,
  source text DEFAULT 'waitlist'::text,
  personal_note text,
  requested_at timestamp with time zone DEFAULT now(),
  invited_at timestamp with time zone,
  activated_at timestamp with time zone,
  user_id uuid,
  invited_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  ref text
);
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  rating integer,
  message text,
  page text,
  feedback_type text DEFAULT 'general'::text,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.capability_dimensions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  band seniority_band NOT NULL,
  sector text,
  position smallint NOT NULL,
  name text NOT NULL,
  why_line text NOT NULL,
  anchor_low text NOT NULL,
  anchor_high text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  framework text,
  anchor_mid text,
  instrument_version smallint DEFAULT 2 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.capability_radar_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  band seniority_band NOT NULL,
  instrument_version smallint DEFAULT 2 NOT NULL,
  levels jsonb DEFAULT '{}'::jsonb NOT NULL,
  taken_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.capability_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  dimension_id uuid NOT NULL,
  level smallint NOT NULL,
  instrument_version smallint DEFAULT 2 NOT NULL,
  answered_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.captures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  raw_content text,
  extracted_text text,
  metadata jsonb DEFAULT '{}'::jsonb,
  processing_status text DEFAULT 'pending'::text NOT NULL,
  error_message text,
  source_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text DEFAULT 'New Chat'::text NOT NULL,
  linked_type text,
  linked_id uuid,
  linked_label text,
  pinned boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  mode text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  name text NOT NULL,
  topic text NOT NULL,
  message text NOT NULL,
  ip_hash text,
  delivered boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.content_gate_cache (
  content_hash text NOT NULL,
  verdict jsonb NOT NULL,
  judge_model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.content_gate_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  post_id uuid,
  function_name text,
  language text,
  overall_score integer,
  pass boolean,
  assertions jsonb,
  weaknesses jsonb,
  skipped boolean DEFAULT false NOT NULL,
  skip_reason text,
  judge_model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  content_hash text,
  expected_ending text
);
CREATE TABLE IF NOT EXISTS public.content_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  signal_id uuid,
  type text NOT NULL,
  title text DEFAULT ''::text NOT NULL,
  body text DEFAULT ''::text NOT NULL,
  language text DEFAULT 'en'::text NOT NULL,
  generation_params jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  made_by text DEFAULT 'unknown'::text NOT NULL,
  arrived_by text DEFAULT 'unknown'::text NOT NULL,
  confidence text DEFAULT 'unknown'::text NOT NULL,
  produced_by text,
  prompt_version text,
  model_used text,
  hook_style text,
  ending_type text,
  move_id text,
  beats text[],
  shape_repeat text,
  voice_match numeric,
  voice_fidelity_flags text[],
  tsv tsvector,
  embedding vector(1536)
);
CREATE TABLE IF NOT EXISTS public.content_lineage (
  id bigint DEFAULT nextval('content_lineage_id_seq'::regclass) NOT NULL,
  content_table text NOT NULL,
  content_id uuid NOT NULL,
  contributor_kind text NOT NULL,
  contributor_id uuid,
  role text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.daily_brief_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  brief_date date NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  audit jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  run_seq integer NOT NULL,
  is_sent boolean DEFAULT false NOT NULL,
  rendered_html text,
  run_reason text
);
CREATE TABLE IF NOT EXISTS public.decisions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  decided_on date DEFAULT (now())::date NOT NULL,
  title text NOT NULL,
  decision text NOT NULL,
  rationale text,
  expected_outcome text,
  metric_key text,
  baseline_value numeric,
  expected_value numeric,
  review_on date,
  status text DEFAULT 'pending'::text NOT NULL,
  actual_value numeric,
  reviewed_on date,
  review_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.deck_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  deck_id text,
  signal_id uuid,
  event text NOT NULL,
  lang text,
  theme text,
  length integer,
  fit_steps integer,
  invariant_failures text[],
  duration_ms integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  pdf_bytes bigint,
  template text
);
CREATE TABLE IF NOT EXISTS public.decks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  signal_id uuid,
  lang text,
  template text,
  theme text,
  slides jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.deleted_test_accounts_20260818 (
  id bigint DEFAULT nextval('deleted_test_accounts_20260818_id_seq'::regclass) NOT NULL,
  source_table text,
  user_id uuid,
  row_json jsonb,
  deleted_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.design_system (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  scope text DEFAULT 'global'::text NOT NULL,
  version integer DEFAULT 1 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  tokens jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid
);
CREATE TABLE IF NOT EXISTS public.desk_answer_feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  question text DEFAULT ''::text NOT NULL,
  answer text DEFAULT ''::text NOT NULL,
  verdict text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.desk_eval_questions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  category text NOT NULL,
  question text NOT NULL,
  expects text NOT NULL,
  trap boolean DEFAULT false NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  question_set text DEFAULT 'set_1'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.desk_eval_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  question_id uuid NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  answer text,
  mode_detected text,
  verdict text,
  failure_kind text,
  notes text,
  axis_consistency text,
  axis_asks_when_unclear text
);
CREATE TABLE IF NOT EXISTS public.desk_learning (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  observation text NOT NULL,
  evidence_count integer DEFAULT 0 NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
  confidence text DEFAULT 'observed'::text NOT NULL,
  dismissed boolean DEFAULT false NOT NULL,
  first_seen timestamp with time zone DEFAULT now() NOT NULL,
  last_seen timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.desk_number_violations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  question text,
  figure text NOT NULL,
  resolved text NOT NULL,
  answer_excerpt text
);
CREATE TABLE IF NOT EXISTS public.diagnostic_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  firm text,
  level text,
  core_practice text,
  sector_focus text,
  north_star_goal text,
  years_experience text,
  leadership_style text,
  generated_skills jsonb DEFAULT '[]'::jsonb NOT NULL,
  skill_ratings jsonb DEFAULT '{}'::jsonb NOT NULL,
  completed boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  brand_pillars text[] DEFAULT '{}'::text[] NOT NULL,
  last_active_at timestamp with time zone DEFAULT now(),
  identity_intelligence jsonb DEFAULT '{}'::jsonb NOT NULL,
  last_visit_at timestamp with time zone DEFAULT now(),
  first_name text,
  onboarding_completed boolean DEFAULT false NOT NULL,
  primary_strength text,
  audit_results jsonb DEFAULT '{}'::jsonb,
  audit_interpretation text,
  audit_completed_at timestamp with time zone,
  brand_assessment_answers jsonb DEFAULT '{}'::jsonb,
  brand_assessment_results jsonb DEFAULT '{}'::jsonb,
  brand_assessment_completed_at timestamp with time zone,
  avatar_url text,
  phone_whatsapp text,
  phone_verified boolean DEFAULT false,
  notification_prefs jsonb DEFAULT '{"inapp_all": true, "push_enabled": false, "email_weekly_brief": true, "email_signal_shifts": true, "whatsapp_silence_alarm": false, "whatsapp_timing_windows": false}'::jsonb,
  linkedin_url text,
  last_name text,
  theme_preference text DEFAULT 'nebula'::text,
  linkedin_handle text,
  onboarding_step integer DEFAULT 0,
  audit_method text,
  shared_learning_consent boolean DEFAULT false NOT NULL,
  lifecycle_opt_out boolean DEFAULT false NOT NULL,
  country text,
  country_code text,
  aura_card_ready_at timestamp with time zone,
  content_language text DEFAULT 'en'::text NOT NULL,
  target_register text,
  ui_dismissals jsonb DEFAULT '{}'::jsonb NOT NULL,
  avatar_cutout_url text,
  display_name_override text,
  default_template text,
  default_theme text,
  timezone text,
  account_type account_type DEFAULT 'customer'::account_type NOT NULL,
  excluded_reason text,
  excluded_at timestamp with time zone,
  seniority_band seniority_band,
  band_source text,
  instrument_version smallint,
  answered_band seniority_band,
  cv_crosscheck jsonb,
  cv_crosscheck_at timestamp with time zone,
  tier text DEFAULT 'read'::text NOT NULL,
  consented_at timestamp with time zone,
  consent_version text,
  journey_reset_at timestamp with time zone,
  composer_sort_pref text,
  plan plan_type DEFAULT 'trial'::plan_type NOT NULL,
  plan_started_at timestamp with time zone,
  trial_ends_at timestamp with time zone,
  plan_source text,
  desk_prefs jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.discovery_review_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  candidate_url text NOT NULL,
  snippet text,
  confidence numeric DEFAULT 0 NOT NULL,
  rejection_reason text DEFAULT 'authorship_uncertain'::text NOT NULL,
  authorship_signals jsonb DEFAULT '[]'::jsonb NOT NULL,
  reviewed boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.document_briefs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  document_id uuid NOT NULL,
  thesis text,
  key_points jsonb DEFAULT '[]'::jsonb NOT NULL,
  key_figures jsonb DEFAULT '[]'::jsonb NOT NULL,
  author_pov text,
  contrarian_angles jsonb DEFAULT '[]'::jsonb NOT NULL,
  so_what jsonb DEFAULT '[]'::jsonb NOT NULL,
  coverage jsonb DEFAULT '{}'::jsonb NOT NULL,
  grounding_score real,
  pipeline_version smallint DEFAULT 1 NOT NULL,
  model text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tsv tsvector,
  embedding vector(1536)
);
CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  chunk_index integer DEFAULT 0 NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  tsv tsvector DEFAULT to_tsvector('english'::regconfig, COALESCE(content, ''::text)),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  embedding vector(1536),
  pipeline_version smallint DEFAULT 1 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.document_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  stage text DEFAULT 'queued'::text NOT NULL,
  cursor integer DEFAULT 0 NOT NULL,
  total integer,
  slice_size integer DEFAULT 25 NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  peak_memory_mb integer,
  failure_code text,
  error_detail text,
  last_heartbeat timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  filename text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  status text DEFAULT 'processing'::text NOT NULL,
  summary text,
  page_count integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  error_message text,
  file_size bigint,
  pages_total integer,
  pages_read integer,
  extraction_method text,
  processing_started_at timestamp with time zone,
  attempt_count integer DEFAULT 0 NOT NULL,
  display_title text,
  document_type text,
  cv_label text
);
CREATE TABLE IF NOT EXISTS public.draft_edits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  post_id uuid,
  language text,
  served_text text,
  published_text text,
  served_chars integer,
  published_chars integer,
  levenshtein_distance integer,
  similarity_ratio numeric,
  first_line_changed boolean,
  numbers_removed integer,
  numbers_added integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ef_error_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  function_name text NOT NULL,
  user_id uuid,
  severity text DEFAULT 'error'::text NOT NULL,
  error_message text,
  context jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.ef_event_log_retired_20260724 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  function_name text,
  severity text,
  error_message text,
  user_id uuid,
  context jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  content text NOT NULL,
  summary text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  skill_pillar text,
  title text,
  has_strategic_insight boolean DEFAULT false NOT NULL,
  pinned boolean DEFAULT false NOT NULL,
  image_url text,
  tsv tsvector DEFAULT ((setweight(to_tsvector('english'::regconfig, COALESCE(title, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(summary, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(content, ''::text)), 'C'::"char")),
  embedding vector(1536),
  account_name text,
  framework_tag text,
  extract_attempts integer DEFAULT 0 NOT NULL,
  source_type text DEFAULT 'user'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.eval_metrics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  metric text NOT NULL,
  value numeric NOT NULL,
  context jsonb DEFAULT '{}'::jsonb NOT NULL,
  measured_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.evidence_fragments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  source_registry_id uuid NOT NULL,
  fragment_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  confidence numeric DEFAULT 0.7 NOT NULL,
  skill_pillars text[] DEFAULT '{}'::text[] NOT NULL,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  entities jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536),
  tsv tsvector,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  pipeline_version smallint DEFAULT 1 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.evidence_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  source_registry_id uuid NOT NULL,
  user_id uuid NOT NULL,
  cursor integer DEFAULT 0 NOT NULL,
  total integer,
  fragments_written integer DEFAULT 0 NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  last_heartbeat timestamp with time zone DEFAULT now() NOT NULL,
  error_detail text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.external_costs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  amount_usd numeric DEFAULT 0 NOT NULL,
  cycle text DEFAULT 'monthly'::text NOT NULL,
  renews_on date,
  status text DEFAULT 'active'::text NOT NULL,
  notes text,
  last_verified date DEFAULT CURRENT_DATE,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.facet_states (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  facet text NOT NULL,
  value numeric DEFAULT 0 NOT NULL,
  uncertainty numeric DEFAULT 1 NOT NULL,
  last_reinforced_at timestamp with time zone,
  inputs jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.focus_accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.framework_activations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  framework_id uuid NOT NULL,
  user_id uuid NOT NULL,
  output_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.freshness_checks (
  check_key text NOT NULL,
  claim text NOT NULL,
  table_name text NOT NULL,
  timestamp_column text NOT NULL,
  filter_sql text,
  warn_after_hours numeric NOT NULL,
  error_after_hours numeric NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  owning_job text
);
CREATE TABLE IF NOT EXISTS public.funnel_daily_ratio (
  day date NOT NULL,
  opens_users integer DEFAULT 0 NOT NULL,
  signals_users integer DEFAULT 0 NOT NULL,
  ratio numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.guide_articles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  tab text NOT NULL,
  category text NOT NULL,
  question_en text,
  answer_en text NOT NULL,
  formula_note_en text,
  related_terms text[] DEFAULT '{}'::text[] NOT NULL,
  surfaces text[] DEFAULT '{}'::text[] NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.guide_slug_misses (
  slug text NOT NULL,
  surface text NOT NULL,
  count integer DEFAULT 1 NOT NULL,
  first_seen timestamp with time zone DEFAULT now() NOT NULL,
  last_seen timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.health_findings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  code text NOT NULL,
  severity text NOT NULL,
  detail text NOT NULL,
  first_seen timestamp with time zone DEFAULT now() NOT NULL,
  last_seen timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.home_address (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  address_date date NOT NULL,
  lens text NOT NULL,
  lens_reason text NOT NULL,
  address_md text NOT NULL,
  moves jsonb DEFAULT '[]'::jsonb NOT NULL,
  facts jsonb DEFAULT '{}'::jsonb NOT NULL,
  model text,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  quality jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.identity_registry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email text,
  linkedin_handle text,
  kind text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.impact_narratives (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  hero_narrative text NOT NULL,
  footprint_insight text NOT NULL,
  content_insight text NOT NULL,
  post_insight text NOT NULL,
  one_action text NOT NULL,
  data_hash text,
  generated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  import_type text DEFAULT 'csv'::text NOT NULL,
  filename text,
  status text DEFAULT 'pending'::text NOT NULL,
  total_rows integer DEFAULT 0 NOT NULL,
  imported_rows integer DEFAULT 0 NOT NULL,
  skipped_rows integer DEFAULT 0 NOT NULL,
  duplicate_rows integer DEFAULT 0 NOT NULL,
  error_details jsonb DEFAULT '[]'::jsonb,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.imprint_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  imprint numeric NOT NULL,
  components jsonb DEFAULT '{}'::jsonb NOT NULL,
  facet_vector jsonb DEFAULT '{}'::jsonb NOT NULL,
  formula_version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tier text
);
CREATE TABLE IF NOT EXISTS public.industry_trends (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  headline text NOT NULL,
  insight text NOT NULL,
  source text NOT NULL,
  url text,
  published_at timestamp with time zone,
  fetched_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  canonical_url text,
  content_markdown text,
  summary text,
  relevance_score integer DEFAULT 0 NOT NULL,
  validation_status text DEFAULT 'unknown'::text NOT NULL,
  last_checked_at timestamp with time zone,
  content_text text,
  validation_score integer DEFAULT 0 NOT NULL,
  topic_relevance_score integer DEFAULT 0 NOT NULL,
  final_score numeric DEFAULT 0 NOT NULL,
  rejection_reason text,
  selection_reason text,
  category text,
  impact_level text,
  confidence_level text,
  opportunity_type text,
  action_recommendation text,
  content_angle text,
  signal_type text,
  snapshot_quality integer DEFAULT 0 NOT NULL,
  is_valid boolean DEFAULT true NOT NULL,
  decision_label text,
  content_raw text,
  content_clean text,
  content_quality_score integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.influence_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
  followers integer,
  follower_growth integer DEFAULT 0 NOT NULL,
  engagement_rate numeric DEFAULT 0 NOT NULL,
  top_format text,
  top_topic text,
  authority_themes jsonb DEFAULT '[]'::jsonb NOT NULL,
  audience_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
  recommendations jsonb DEFAULT '[]'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tone_analysis jsonb DEFAULT '[]'::jsonb NOT NULL,
  format_breakdown jsonb DEFAULT '{}'::jsonb NOT NULL,
  post_count integer DEFAULT 0 NOT NULL,
  authority_trajectory text,
  impressions integer DEFAULT 0 NOT NULL,
  reactions integer DEFAULT 0 NOT NULL,
  comments integer DEFAULT 0 NOT NULL,
  shares integer DEFAULT 0 NOT NULL,
  saves integer DEFAULT 0 NOT NULL,
  posts_count integer DEFAULT 0 NOT NULL,
  source_type text DEFAULT 'unknown'::text NOT NULL,
  members_reached integer,
  total_impressions_annual integer
);
CREATE TABLE IF NOT EXISTS public.instrument_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text DEFAULT 'assessment'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.job_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_type text NOT NULL,
  user_id uuid,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  max_attempts integer DEFAULT 3 NOT NULL,
  claimed_at timestamp with time zone,
  claimed_by text,
  scheduled_for timestamp with time zone DEFAULT now() NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.known_issues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  detail text,
  severity text NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  area text,
  trigger_note text,
  detected_at timestamp with time zone DEFAULT now() NOT NULL,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.learned_intelligence (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  source_entry_id uuid,
  source_document_id uuid,
  intelligence_type text DEFAULT 'framework'::text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  skill_pillars text[] DEFAULT '{}'::text[] NOT NULL,
  skill_boost_pct numeric DEFAULT 3 NOT NULL,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  embedding vector(1536),
  tsv tsvector,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lifecycle_email_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  message_key text NOT NULL,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.lifecycle_emails (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  email_type text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.linkedin_connections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  linkedin_id text,
  display_name text,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamp with time zone,
  scopes text[] DEFAULT '{}'::text[],
  connected_at timestamp with time zone DEFAULT now(),
  last_synced_at timestamp with time zone,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  handle text,
  profile_name text,
  profile_url text,
  source_status text DEFAULT 'unknown'::text NOT NULL,
  timezone text,
  claim_token_hash text,
  followers_total integer,
  followers_total_at timestamp with time zone,
  can_post boolean,
  post_checked_at timestamp with time zone,
  post_check_error text
);
CREATE TABLE IF NOT EXISTS public.linkedin_connections_guessed_20260812 (
  id uuid,
  user_id uuid,
  linkedin_id text,
  display_name text,
  access_token text,
  refresh_token text,
  token_expires_at timestamp with time zone,
  scopes text[],
  connected_at timestamp with time zone,
  last_synced_at timestamp with time zone,
  status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  handle text,
  profile_name text,
  profile_url text,
  source_status text,
  timezone text,
  claim_token_hash text,
  followers_total integer,
  followers_total_at timestamp with time zone,
  can_post boolean,
  post_checked_at timestamp with time zone,
  post_check_error text
);
CREATE TABLE IF NOT EXISTS public.linkedin_post_metrics (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  snapshot_date date DEFAULT CURRENT_DATE NOT NULL,
  impressions integer DEFAULT 0 NOT NULL,
  reactions integer DEFAULT 0 NOT NULL,
  comments integer DEFAULT 0 NOT NULL,
  shares integer DEFAULT 0 NOT NULL,
  saves integer DEFAULT 0 NOT NULL,
  engagement_rate numeric DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  source_type text DEFAULT 'manual'::text NOT NULL,
  members_reached integer DEFAULT 0 NOT NULL,
  sends integer DEFAULT 0 NOT NULL,
  link_clicks integer DEFAULT 0 NOT NULL,
  profile_views integer DEFAULT 0 NOT NULL,
  followers_gained integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.linkedin_posts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  linkedin_post_id text,
  post_text text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  published_at timestamp with time zone,
  like_count integer DEFAULT 0 NOT NULL,
  comment_count integer DEFAULT 0 NOT NULL,
  repost_count integer DEFAULT 0 NOT NULL,
  engagement_score numeric DEFAULT 0 NOT NULL,
  media_type text DEFAULT 'text'::text,
  theme text,
  tone text,
  format_type text,
  synced_at timestamp with time zone DEFAULT now() NOT NULL,
  post_url text,
  title text,
  hook text,
  topic_label text,
  framework_type text,
  visual_style text,
  content_type text,
  carousel_structure_type text,
  hook_style text,
  cta_style text,
  content_engine_output_type text,
  visual_strategy_type text,
  tracking_status text DEFAULT 'discovered'::text NOT NULL,
  rejection_reason text,
  source_type text DEFAULT 'search_discovery'::text NOT NULL,
  source_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  enriched_by text[] DEFAULT '{}'::text[] NOT NULL,
  source_trust integer DEFAULT 1 NOT NULL,
  source_signal_id uuid,
  published_confirmed_at timestamp with time zone,
  linkedin_url text,
  quality_score jsonb,
  authorship text DEFAULT 'unset'::text NOT NULL,
  acquisition text DEFAULT 'unset'::text NOT NULL,
  claimed_at timestamp with time zone,
  publish_attempted_at timestamp with time zone,
  original_generated_text text,
  ending_type text,
  stance text,
  moment_id uuid,
  voice_match numeric,
  unsourced_numbers_removed integer DEFAULT 0 NOT NULL,
  edited_at timestamp with time zone,
  edit_distance numeric,
  unsourced_entities_removed integer DEFAULT 0 NOT NULL,
  voice_corpus_status text DEFAULT 'included'::text,
  voice_corpus_reason text,
  made_by text DEFAULT 'unknown'::text NOT NULL,
  arrived_by text DEFAULT 'unknown'::text NOT NULL,
  confidence text DEFAULT 'unknown'::text NOT NULL,
  produced_by text,
  prompt_version text,
  model_used text,
  text_is_snippet boolean DEFAULT false NOT NULL,
  embedding vector(1536),
  tsv tsvector
);
CREATE TABLE IF NOT EXISTS public.linkedin_profile_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  fetched_at timestamp with time zone DEFAULT now() NOT NULL,
  full_name text,
  headline text,
  about text,
  photo_url text,
  location text,
  followers integer,
  connections integer,
  experience jsonb,
  education jsonb,
  skills jsonb,
  languages jsonb,
  certifications jsonb,
  raw jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.linkedin_profile_snapshots_backup_20260821 (
  id uuid,
  user_id uuid,
  fetched_at timestamp with time zone,
  full_name text,
  headline text,
  about text,
  photo_url text,
  location text,
  followers integer,
  connections integer,
  experience jsonb,
  education jsonb,
  skills jsonb,
  languages jsonb,
  certifications jsonb,
  raw jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.market_mirror_cache (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  headhunter_text text,
  client_cio_text text,
  curator_text text,
  gaps jsonb,
  generated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.master_frameworks (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  entry_id uuid,
  title text NOT NULL,
  source_type text DEFAULT 'capture'::text NOT NULL,
  framework_steps jsonb DEFAULT '[]'::jsonb NOT NULL,
  summary text,
  tags text[] DEFAULT '{}'::text[] NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  diagram_url text,
  diagram_description jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.member_issue_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  kind text NOT NULL,
  message text NOT NULL,
  route text,
  component_stack text,
  user_agent text,
  app_version text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.metric_targets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  metric_key text NOT NULL,
  target_value numeric NOT NULL,
  target_by date NOT NULL,
  baseline_value numeric,
  baseline_on date,
  rationale text NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  reviewed_on date,
  review_note text,
  set_on date DEFAULT ((now() AT TIME ZONE 'utc'::text))::date NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.mirror_reads (
  handle text NOT NULL,
  canonical_url text NOT NULL,
  read jsonb NOT NULL,
  sparse boolean DEFAULT false NOT NULL,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  hit_count integer DEFAULT 1 NOT NULL,
  name text,
  posts_read integer,
  read_version smallint DEFAULT 1 NOT NULL,
  emailed_at timestamp with time zone,
  emailed_to text,
  avatar_url text,
  headline text
);
CREATE TABLE IF NOT EXISTS public.mirror_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ip_hash text NOT NULL,
  handle text,
  email text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  ref text,
  status text DEFAULT 'ok'::text NOT NULL
);
CREATE TABLE IF NOT EXISTS public.narrative_suggestions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  topic text NOT NULL,
  angle text DEFAULT ''::text NOT NULL,
  recommended_format text DEFAULT 'post'::text NOT NULL,
  reason text DEFAULT ''::text NOT NULL,
  source_signal_id uuid,
  status text DEFAULT 'suggested'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  channel text NOT NULL,
  title text NOT NULL,
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  acted_on boolean DEFAULT false,
  sent_at timestamp with time zone DEFAULT now(),
  read_at timestamp with time zone,
  expires_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  type text DEFAULT 'progress'::text NOT NULL,
  read boolean DEFAULT false NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.onboarding_article_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  sector_focus text,
  core_practice text,
  outcome text NOT NULL,
  url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.onboarding_questions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  band seniority_band NOT NULL,
  sector text,
  position smallint NOT NULL,
  prompt text NOT NULL,
  helper text,
  options jsonb,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  kind text DEFAULT 'choice'::text NOT NULL,
  max_choices smallint,
  framework text,
  feeds text,
  why_asked text,
  allow_none boolean DEFAULT true NOT NULL,
  randomise boolean DEFAULT true NOT NULL,
  instrument_version smallint DEFAULT 2 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.operation_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  operation text NOT NULL,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  finished_at timestamp with time zone,
  outcome text,
  reason_code text,
  attempt integer DEFAULT 1 NOT NULL,
  user_id uuid,
  anon_token text,
  fingerprint_hash text,
  cost_usd numeric,
  meta jsonb DEFAULT '{}'::jsonb NOT NULL,
  stages jsonb DEFAULT '[]'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  subject text,
  body text,
  severity text,
  source text,
  emailed boolean DEFAULT false NOT NULL,
  what text,
  impact text,
  action text,
  status text DEFAULT 'open'::text NOT NULL,
  resolved_at timestamp with time zone,
  last_seen timestamp with time zone DEFAULT now(),
  occurrences integer DEFAULT 1 NOT NULL,
  last_emailed timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.output_leak_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  function_name text,
  language text,
  leak_stage text,
  first_lines text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.page_backgrounds (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  page_key text NOT NULL,
  theme text DEFAULT 'both'::text NOT NULL,
  image_url text,
  gradient_overlay text DEFAULT 'linear-gradient(180deg, rgba(26,22,15,0.2) 0%, rgba(26,22,15,0.85) 70%, var(--paper) 100%)'::text,
  tint_color text,
  opacity numeric DEFAULT 0.07,
  position text DEFAULT 'center'::text,
  enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.post_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  event text NOT NULL,
  at timestamp with time zone DEFAULT now() NOT NULL,
  actor text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  event text NOT NULL,
  props jsonb DEFAULT '{}'::jsonb NOT NULL,
  session_id text,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.product_facts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  category text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.profile_copy_drafts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  target text NOT NULL,
  options jsonb NOT NULL,
  language text,
  posts_used integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  copied_at timestamp with time zone,
  copied_text text,
  copied_angle text,
  applied_at timestamp with time zone,
  source_headline text,
  source_about text
);
CREATE TABLE IF NOT EXISTS public.qa_audit_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_at timestamp with time zone DEFAULT now(),
  run_by uuid,
  layer text NOT NULL,
  category text NOT NULL,
  test_id text NOT NULL,
  test_name text NOT NULL,
  status text NOT NULL,
  details jsonb,
  run_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.qa_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_at timestamp with time zone DEFAULT now(),
  total_checks integer,
  passed integer,
  failed integer,
  results jsonb,
  triggered_by text DEFAULT 'manual'::text
);
CREATE TABLE IF NOT EXISTS public.qa_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  run_at timestamp with time zone DEFAULT now() NOT NULL,
  check_key text NOT NULL,
  status text NOT NULL,
  detail text,
  value_json jsonb DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS public.read_queue (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  operation text DEFAULT 'linkedin_read'::text NOT NULL,
  fingerprint_hash text,
  anon_token text,
  notified_at timestamp with time zone
);
CREATE TABLE IF NOT EXISTS public.recommended_moves_retired_20260718 (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  title text NOT NULL,
  rationale text DEFAULT ''::text NOT NULL,
  output_type text DEFAULT 'post'::text NOT NULL,
  source_signal_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.register_options (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  label text NOT NULL,
  language text,
  sort_order integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.report_shares (
  token text NOT NULL,
  user_id uuid NOT NULL,
  headline text,
  archetype text,
  market_read text,
  subjects jsonb DEFAULT '[]'::jsonb,
  own_words text,
  lang text DEFAULT 'en'::text,
  display_name text,
  views integer DEFAULT 0 NOT NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.report_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  version integer NOT NULL,
  data jsonb NOT NULL,
  is_current boolean DEFAULT true NOT NULL,
  created_by text DEFAULT 'system'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.request_snapshots (
  id bigint DEFAULT nextval('request_snapshots_id_seq'::regclass) NOT NULL,
  response_id bigint,
  requested_at timestamp with time zone,
  status_code integer,
  error_msg text,
  url text,
  failure_kind text,
  captured_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.retrieval_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  caller text NOT NULL,
  query text,
  query_len integer,
  result_count integer,
  kinds jsonb,
  top_rank real,
  degraded boolean DEFAULT false NOT NULL,
  error text,
  latency_ms integer,
  pipeline_version smallint DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.score_snapshots (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  score integer DEFAULT 0 NOT NULL,
  components jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  tier text
);
CREATE TABLE IF NOT EXISTS public.seniority_titles (
  title text NOT NULL,
  band seniority_band NOT NULL,
  position smallint NOT NULL,
  active boolean DEFAULT true NOT NULL
);
CREATE TABLE IF NOT EXISTS public.ship_markers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  shipped_on date NOT NULL,
  title text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.signal_engagements (
  user_id uuid NOT NULL,
  signal_id uuid NOT NULL,
  open_count integer DEFAULT 0 NOT NULL,
  last_opened_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.signal_topic_preferences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  theme_tag text NOT NULL,
  preference_score double precision DEFAULT 0.0,
  updated_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.signature_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  family text,
  lang text,
  action text NOT NULL,
  payload jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ip_hash text NOT NULL,
  email_hash text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.signup_ceiling_alerts (
  ip_hash text NOT NULL,
  last_sent_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.signup_refusals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  ip_hash text,
  code text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.skill_targets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  pillar text NOT NULL,
  target_hours numeric(7,2) DEFAULT 100 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.source_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  occurred_at timestamp with time zone DEFAULT now() NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  processed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.source_registry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  title text,
  content_preview text,
  source_metadata jsonb DEFAULT '{}'::jsonb,
  processed boolean DEFAULT false NOT NULL,
  processed_at timestamp with time zone,
  fragment_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  signal_status text
);
CREATE TABLE IF NOT EXISTS public.strategic_signals (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  signal_title text NOT NULL,
  explanation text NOT NULL,
  strategic_implications text NOT NULL,
  supporting_evidence_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  theme_tags text[] DEFAULT '{}'::text[] NOT NULL,
  skill_pillars text[] DEFAULT '{}'::text[] NOT NULL,
  confidence numeric DEFAULT 0.7 NOT NULL,
  fragment_count integer DEFAULT 0 NOT NULL,
  framework_opportunity jsonb DEFAULT '{}'::jsonb,
  content_opportunity jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  consulting_opportunity jsonb DEFAULT '{}'::jsonb,
  unique_orgs integer DEFAULT 1 NOT NULL,
  confidence_explanation text,
  what_it_means_for_you text,
  priority_score numeric DEFAULT 0.5 NOT NULL,
  user_signal_feedback text,
  signal_velocity double precision,
  velocity_status text DEFAULT 'stable'::text,
  last_decay_at timestamp with time zone,
  commercial_validation_score double precision,
  base_confidence numeric,
  momentum numeric,
  last_evidence_at timestamp with time zone,
  lifecycle_tier text,
  strength_score numeric,
  pipeline_version smallint DEFAULT 1 NOT NULL,
  embedding vector(1536),
  tsv tsvector
);
CREATE TABLE IF NOT EXISTS public.strategic_signals_orphans_20260811 (
  id uuid,
  user_id uuid,
  signal_title text,
  explanation text,
  strategic_implications text,
  supporting_evidence_ids uuid[],
  theme_tags text[],
  skill_pillars text[],
  confidence numeric,
  fragment_count integer,
  framework_opportunity jsonb,
  content_opportunity jsonb,
  status text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  consulting_opportunity jsonb,
  unique_orgs integer,
  confidence_explanation text,
  what_it_means_for_you text,
  priority_score numeric,
  user_signal_feedback text,
  signal_velocity double precision,
  velocity_status text,
  last_decay_at timestamp with time zone,
  commercial_validation_score double precision,
  base_confidence numeric,
  momentum numeric,
  last_evidence_at timestamp with time zone,
  lifecycle_tier text,
  strength_score numeric
);
CREATE TABLE IF NOT EXISTS public.sync_errors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  sync_run_id uuid,
  error_type text DEFAULT 'unknown'::text NOT NULL,
  error_message text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  account_id uuid,
  started_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  status text DEFAULT 'running'::text NOT NULL,
  records_fetched integer DEFAULT 0 NOT NULL,
  records_stored integer DEFAULT 0 NOT NULL,
  sync_type text DEFAULT 'full'::text NOT NULL,
  error_message text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.theme_aliases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  canonical text NOT NULL,
  alias text NOT NULL,
  locale text DEFAULT 'en'::text NOT NULL,
  source text DEFAULT 'seed'::text NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.training_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  pillar text NOT NULL,
  duration_hours numeric(5,2) DEFAULT 0 NOT NULL,
  topic text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_milestones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  milestone_id text NOT NULL,
  milestone_name text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb NOT NULL,
  earned_at timestamp with time zone DEFAULT now() NOT NULL,
  acknowledged boolean DEFAULT false NOT NULL,
  shared boolean DEFAULT false NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.user_widget_layout (
  user_id uuid NOT NULL,
  layout jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_distribution (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  language text NOT NULL,
  corpus_n integer DEFAULT 0 NOT NULL,
  computed_at timestamp with time zone DEFAULT now() NOT NULL,
  open_type_share jsonb,
  land_type_share jsonb,
  move_share jsonb,
  marker_rate jsonb,
  length_p25 integer,
  length_p50 integer,
  length_p75 integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_feedback (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  profile_id uuid,
  post_id uuid,
  sample_text text,
  verdict text NOT NULL,
  applied_changes jsonb DEFAULT '[]'::jsonb NOT NULL,
  mode_scope text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_learning_prefs (
  user_id uuid NOT NULL,
  learn_from_performance boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_post_outcomes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  post_id uuid NOT NULL,
  published_at timestamp with time zone,
  followers_at_publish integer,
  impressions integer,
  engagement_rate numeric,
  reactions integer,
  comments integer,
  shares integer,
  performance_index numeric,
  performance_index_raw numeric,
  baseline_engagement_rate numeric,
  sample_traits jsonb DEFAULT '{}'::jsonb NOT NULL,
  hook_style text,
  ending_type text,
  computed_at timestamp with time zone DEFAULT now() NOT NULL,
  excluded boolean DEFAULT false NOT NULL,
  exclusion_reason text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  outcome_source text,
  total_engagement integer,
  baseline_total_engagement numeric
);
CREATE TABLE IF NOT EXISTS public.voice_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  profile_id uuid,
  kind text NOT NULL,
  text text NOT NULL,
  source text DEFAULT 'user'::text NOT NULL,
  rank integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  status text DEFAULT 'active'::text NOT NULL,
  evidence jsonb,
  suggested_at timestamp with time zone,
  decided_at timestamp with time zone,
  check jsonb,
  last_applied_at timestamp with time zone,
  times_applied integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_trait_registry (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  trait_key text NOT NULL,
  display_name text NOT NULL,
  pole_low text NOT NULL,
  pole_high text NOT NULL,
  group_key text NOT NULL,
  unit text,
  computable boolean DEFAULT true NOT NULL,
  min_evidence integer DEFAULT 8 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_trait_rejections (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  trait_key text NOT NULL,
  rejected_value numeric,
  rejected_until timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.voice_traits (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  trait_key text NOT NULL,
  value numeric NOT NULL,
  band_low numeric,
  band_high numeric,
  raw_value numeric,
  confidence text NOT NULL,
  source text NOT NULL,
  evidence_count integer DEFAULT 0 NOT NULL,
  locked boolean DEFAULT false NOT NULL,
  last_confirmed_at timestamp with time zone,
  computed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.weekly_missions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  mission_type text NOT NULL,
  title text NOT NULL,
  description text,
  points integer DEFAULT 5,
  status text DEFAULT 'pending'::text,
  completed_at timestamp with time zone,
  expires_at timestamp with time zone,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.whatsapp_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  phone_e164 text,
  pair_token text,
  token_expires_at timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  bound_at timestamp with time zone,
  last_message_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  wa_message_id text NOT NULL,
  user_id uuid,
  from_phone text,
  body text,
  kind text,
  entry_id uuid,
  result text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS public.widget_slot_votes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  slot_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

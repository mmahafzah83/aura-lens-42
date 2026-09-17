-- ============================================================
-- Opportunity Engine — step 1: schema only
-- ============================================================

-- ------------------------------------------------------------
-- 1) MACHINE TABLES
-- ------------------------------------------------------------

CREATE TABLE public.oe_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  lane text NOT NULL CHECK (lane IN ('official','licensed','open','member')),
  kind text NOT NULL CHECK (kind IN ('rss','sitemap','listing','api','telegram','calendar','manual','member_forward')),
  url text,
  issuer_hint text,
  country text NOT NULL DEFAULT 'SA',
  language text NOT NULL DEFAULT 'ar',
  chair_types text[] NOT NULL DEFAULT '{}',
  read_method text,
  terms_note text,
  terms_ok boolean NOT NULL DEFAULT false,
  owner text,
  cadence text NOT NULL DEFAULT 'weekly' CHECK (cadence IN ('daily','weekly','monthly','paused','out')),
  score_quality numeric,
  score_speed numeric,
  score_yield numeric,
  score_legality numeric,
  score_cost numeric,
  last_fetched_at timestamptz,
  last_changed_at timestamptz,
  last_error text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_feeds TO authenticated;
GRANT ALL ON public.oe_feeds TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_feeds FROM authenticated;
ALTER TABLE public.oe_feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read feeds" ON public.oe_feeds FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE UNIQUE INDEX oe_feeds_url_key ON public.oe_feeds (url) WHERE url IS NOT NULL;
CREATE UNIQUE INDEX oe_feeds_name_key ON public.oe_feeds (name);
CREATE TRIGGER oe_feeds_set_updated_at BEFORE UPDATE ON public.oe_feeds FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.oe_issuers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL UNIQUE,
  name_ar text,
  name_en text,
  aliases text[] NOT NULL DEFAULT '{}',
  domain text,
  kind text CHECK (kind IN ('listed_company','ministry','authority','fund','university','event_host','firm','other')),
  tadawul_code text,
  sector text,
  history jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_issuers TO authenticated;
GRANT ALL ON public.oe_issuers TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_issuers FROM authenticated;
ALTER TABLE public.oe_issuers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read issuers" ON public.oe_issuers FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE TRIGGER oe_issuers_set_updated_at BEFORE UPDATE ON public.oe_issuers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.oe_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES public.oe_feeds(id) ON DELETE SET NULL,
  issuer_id uuid REFERENCES public.oe_issuers(id) ON DELETE SET NULL,
  issuer_raw text,
  chair_type text NOT NULL CHECK (chair_type IN ('board','mandate','role','room','speaking','media','advisory','award','learning')),
  time_kind text NOT NULL CHECK (time_kind IN ('open_now','early_signal')),
  title text NOT NULL,
  scope text,
  sector text,
  seniority_band text CHECK (seniority_band IN ('work','table','room')),
  location text,
  remote boolean,
  requirements jsonb NOT NULL DEFAULT '[]',
  deadline date,
  signal_date date,
  posting_date date,
  evidence_quote text,
  quote_verified boolean NOT NULL DEFAULT false,
  source_url text NOT NULL,
  canonical_url text,
  content_hash text,
  language text,
  extraction_confidence numeric,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  alive boolean NOT NULL DEFAULT true,
  raw jsonb,
  embedding vector(1536),
  tsv tsvector,
  pipeline_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_opportunities TO authenticated;
GRANT ALL ON public.oe_opportunities TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_opportunities FROM authenticated;
ALTER TABLE public.oe_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read opportunities" ON public.oe_opportunities FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE UNIQUE INDEX oe_opportunities_canonical_url_key ON public.oe_opportunities (canonical_url) WHERE canonical_url IS NOT NULL;
CREATE INDEX oe_opportunities_content_hash_idx ON public.oe_opportunities (content_hash);
CREATE INDEX oe_opportunities_chair_alive_deadline_idx ON public.oe_opportunities (chair_type, alive, deadline);
CREATE INDEX oe_opportunities_embedding_idx ON public.oe_opportunities USING hnsw (embedding vector_cosine_ops);
CREATE INDEX oe_opportunities_tsv_idx ON public.oe_opportunities USING gin (tsv);
CREATE TRIGGER oe_opportunities_set_updated_at BEFORE UPDATE ON public.oe_opportunities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.oe_opportunities_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.scope, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.requirements::text, '')), 'C');
  RETURN NEW;
END;
$$;

CREATE TRIGGER oe_opportunities_tsv_update
BEFORE INSERT OR UPDATE ON public.oe_opportunities
FOR EACH ROW EXECUTE FUNCTION public.oe_opportunities_tsv_trigger();


CREATE TABLE public.oe_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  rubric_version text NOT NULL,
  retrieval jsonb,
  scores jsonb NOT NULL,
  score_avg numeric,
  unstable boolean NOT NULL DEFAULT false,
  fit_band text CHECK (fit_band IN ('strong','worth_a_look','stretch')),
  win_band text CHECK (win_band IN ('strong','worth_a_look','stretch')),
  win_basis jsonb,
  gate_passed boolean NOT NULL DEFAULT false,
  gate_reason text,
  explore_slot boolean NOT NULL DEFAULT false,
  judged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id, rubric_version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_matches TO authenticated;
GRANT ALL ON public.oe_matches TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_matches FROM authenticated;
ALTER TABLE public.oe_matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read matches" ON public.oe_matches FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE INDEX oe_matches_user_judged_idx ON public.oe_matches (user_id, judged_at DESC);


CREATE TABLE public.oe_leadtime_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  posted_opportunity_id uuid REFERENCES public.oe_opportunities(id) ON DELETE SET NULL,
  chair_type text,
  signal_date date NOT NULL,
  posting_date date,
  lead_days integer GENERATED ALWAYS AS (posting_date - signal_date) STORED,
  confirmed boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_leadtime_pairs TO authenticated;
GRANT ALL ON public.oe_leadtime_pairs TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_leadtime_pairs FROM authenticated;
ALTER TABLE public.oe_leadtime_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read lead time pairs" ON public.oe_leadtime_pairs FOR SELECT TO authenticated USING (public.is_current_user_admin());


CREATE TABLE public.oe_policy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  params jsonb NOT NULL,
  rubric jsonb NOT NULL,
  changed_by text,
  reason text,
  evidence text,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_policy_versions TO authenticated;
GRANT ALL ON public.oe_policy_versions TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_policy_versions FROM authenticated;
ALTER TABLE public.oe_policy_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read policy versions" ON public.oe_policy_versions FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE UNIQUE INDEX oe_policy_versions_one_active_idx ON public.oe_policy_versions (active) WHERE active = true;


CREATE TABLE public.oe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_kind text NOT NULL,
  user_id uuid,
  feed_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text,
  counts jsonb NOT NULL DEFAULT '{}',
  cost_usd numeric,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_runs TO authenticated;
GRANT ALL ON public.oe_runs TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.oe_runs FROM authenticated;
ALTER TABLE public.oe_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read runs" ON public.oe_runs FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE INDEX oe_runs_kind_started_idx ON public.oe_runs (run_kind, started_at DESC);


-- ------------------------------------------------------------
-- 2) MEMBER TABLES
-- ------------------------------------------------------------

CREATE TABLE public.oe_faces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  face text NOT NULL CHECK (face IN ('done','wants','reads','stands','avoid')),
  summary text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  queries text[] NOT NULL DEFAULT '{}',
  weight numeric NOT NULL DEFAULT 0.2,
  embedding vector(1536),
  inputs jsonb NOT NULL DEFAULT '{}',
  built_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, face)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_faces TO authenticated;
GRANT ALL ON public.oe_faces TO service_role;
ALTER TABLE public.oe_faces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own faces" ON public.oe_faces FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own faces" ON public.oe_faces FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own faces" ON public.oe_faces FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own faces" ON public.oe_faces FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read faces" ON public.oe_faces FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE TRIGGER oe_faces_set_updated_at BEFORE UPDATE ON public.oe_faces FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.oe_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('matching','whatsapp','forwarding','export_ingest')),
  version text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_consents TO authenticated;
GRANT ALL ON public.oe_consents TO service_role;
ALTER TABLE public.oe_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own consents" ON public.oe_consents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own consents" ON public.oe_consents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own consents" ON public.oe_consents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own consents" ON public.oe_consents FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read consents" ON public.oe_consents FOR SELECT TO authenticated USING (public.is_current_user_admin());


CREATE TABLE public.oe_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.oe_matches(id) ON DELETE SET NULL,
  card_date date NOT NULL,
  why_lines jsonb NOT NULL DEFAULT '[]',
  gap_line jsonb,
  quote text,
  clock_text text,
  fit_band text,
  win_band text,
  explore_slot boolean NOT NULL DEFAULT false,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','whatsapp','inapp')),
  tap_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  token_expires_at timestamptz NOT NULL DEFAULT (now() + interval '21 days'),
  sent_at timestamptz,
  opened_at timestamptz,
  dismissed_unread boolean NOT NULL DEFAULT false,
  kit_offered boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_cards TO authenticated;
GRANT ALL ON public.oe_cards TO service_role;
ALTER TABLE public.oe_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own cards" ON public.oe_cards FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cards" ON public.oe_cards FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cards" ON public.oe_cards FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cards" ON public.oe_cards FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read cards" ON public.oe_cards FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE UNIQUE INDEX oe_cards_user_opportunity_key ON public.oe_cards (user_id, opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX oe_cards_user_date_idx ON public.oe_cards (user_id, card_date DESC);
CREATE TRIGGER oe_cards_set_updated_at BEFORE UPDATE ON public.oe_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.oe_taps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.oe_cards(id) ON DELETE CASCADE,
  tap text NOT NULL CHECK (tap IN ('right','not_quite','not_my_area','less_from_here')),
  scope text CHECK (scope IN ('issuer','level','place','type','just_this')),
  scope_value text,
  source text CHECK (source IN ('email','whatsapp','inapp')),
  tapped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, tap)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_taps TO authenticated;
GRANT ALL ON public.oe_taps TO service_role;
ALTER TABLE public.oe_taps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own taps" ON public.oe_taps FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own taps" ON public.oe_taps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own taps" ON public.oe_taps FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own taps" ON public.oe_taps FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read taps" ON public.oe_taps FOR SELECT TO authenticated USING (public.is_current_user_admin());


CREATE TABLE public.oe_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.oe_cards(id) ON DELETE SET NULL,
  what_we_said jsonb,
  what_he_changed jsonb,
  sector text,
  seniority_band text,
  chair_type text,
  feed_lane text,
  issuer_kind text,
  reach text,
  reach_value text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_corrections TO authenticated;
GRANT ALL ON public.oe_corrections TO service_role;
ALTER TABLE public.oe_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own corrections" ON public.oe_corrections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own corrections" ON public.oe_corrections FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own corrections" ON public.oe_corrections FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own corrections" ON public.oe_corrections FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read corrections" ON public.oe_corrections FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE INDEX oe_corrections_user_expires_idx ON public.oe_corrections (user_id, expires_at);

CREATE VIEW public.oe_connected_brain AS
SELECT id, what_we_said, what_he_changed, sector, seniority_band, chair_type,
       feed_lane, issuer_kind, reach, reach_value, expires_at, created_at
FROM public.oe_corrections;
REVOKE ALL ON public.oe_connected_brain FROM anon, authenticated;
GRANT SELECT ON public.oe_connected_brain TO service_role;


CREATE TABLE public.oe_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.oe_cards(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('pursued','not_yet','no','shortlisted','won','declined','no_news')),
  answered_at timestamptz NOT NULL DEFAULT now(),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_outcomes TO authenticated;
GRANT ALL ON public.oe_outcomes TO service_role;
ALTER TABLE public.oe_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own outcomes" ON public.oe_outcomes FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own outcomes" ON public.oe_outcomes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own outcomes" ON public.oe_outcomes FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own outcomes" ON public.oe_outcomes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read outcomes" ON public.oe_outcomes FOR SELECT TO authenticated USING (public.is_current_user_admin());


CREATE TABLE public.oe_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES public.oe_cards(id) ON DELETE CASCADE,
  profile_fixes jsonb NOT NULL DEFAULT '[]',
  talking_points jsonb NOT NULL DEFAULT '[]',
  writing text,
  writing_lang text,
  voice_profile_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','used')),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_kits TO authenticated;
GRANT ALL ON public.oe_kits TO service_role;
ALTER TABLE public.oe_kits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own kits" ON public.oe_kits FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own kits" ON public.oe_kits FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own kits" ON public.oe_kits FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own kits" ON public.oe_kits FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can read kits" ON public.oe_kits FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE TRIGGER oe_kits_set_updated_at BEFORE UPDATE ON public.oe_kits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ------------------------------------------------------------
-- 4) SHARED TABLE CHANGE — notification_events type check
-- ------------------------------------------------------------
ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_type_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_type_check
  CHECK (type IN ('timing_window','silence_alarm','signal_shift','weekly_brief','knowledge_debt','morning_signal','member_reminder','opportunity_card'));


-- ------------------------------------------------------------
-- 5) JOB QUEUE — one live fetch per feed
-- ------------------------------------------------------------
CREATE UNIQUE INDEX job_queue_oe_fetch_feed_live_idx
  ON public.job_queue ((payload->>'feed_id'))
  WHERE job_type = 'oe_fetch_feed' AND status IN ('pending','claimed');


-- ------------------------------------------------------------
-- 6) RPC — record a tap from an email link
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.oe_record_tap(
  p_token text,
  p_tap text,
  p_scope text DEFAULT NULL,
  p_scope_value text DEFAULT NULL,
  p_source text DEFAULT 'email'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card public.oe_cards%ROWTYPE;
  v_opp public.oe_opportunities%ROWTYPE;
  v_lane text;
BEGIN
  IF p_tap IS NULL OR p_tap NOT IN ('right','not_quite','not_my_area','less_from_here') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tap');
  END IF;

  SELECT * INTO v_card
  FROM public.oe_cards
  WHERE tap_token = p_token AND token_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired_or_unknown');
  END IF;

  INSERT INTO public.oe_taps (user_id, card_id, tap, scope, scope_value, source)
  VALUES (v_card.user_id, v_card.id, p_tap, p_scope, p_scope_value, p_source)
  ON CONFLICT (card_id, tap) DO UPDATE
    SET scope = EXCLUDED.scope,
        scope_value = EXCLUDED.scope_value,
        tapped_at = now();

  UPDATE public.oe_cards
     SET opened_at = COALESCE(opened_at, now()),
         kit_offered = CASE WHEN p_tap = 'right' THEN true ELSE kit_offered END
   WHERE id = v_card.id;

  IF v_card.opportunity_id IS NOT NULL THEN
    SELECT * INTO v_opp FROM public.oe_opportunities WHERE id = v_card.opportunity_id;
    IF FOUND AND v_opp.feed_id IS NOT NULL THEN
      SELECT lane INTO v_lane FROM public.oe_feeds WHERE id = v_opp.feed_id;
    END IF;
  END IF;

  IF p_tap = 'not_my_area' THEN
    INSERT INTO public.oe_corrections
      (user_id, card_id, sector, seniority_band, chair_type, feed_lane, reach, reach_value, expires_at)
    VALUES
      (v_card.user_id, v_card.id, v_opp.sector, v_opp.seniority_band, v_opp.chair_type, v_lane,
       COALESCE(p_scope, 'just_this'), p_scope_value, now() + interval '90 days');
  ELSIF p_tap = 'not_quite' THEN
    INSERT INTO public.oe_corrections
      (user_id, card_id, sector, seniority_band, chair_type, feed_lane, reach, reach_value, expires_at)
    VALUES
      (v_card.user_id, v_card.id, v_opp.sector, v_opp.seniority_band, v_opp.chair_type, v_lane,
       'just_this', p_scope_value, now() + interval '42 days');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', v_card.id,
    'tap', p_tap,
    'next', CASE
      WHEN p_tap = 'right' THEN 'kit_offer'
      WHEN p_tap = 'not_my_area' AND p_scope IS NULL THEN 'which_part'
      ELSE 'thanks'
    END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.oe_record_tap(text, text, text, text, text) TO anon, authenticated, service_role;


-- ------------------------------------------------------------
-- 7) SEED
-- ------------------------------------------------------------
INSERT INTO public.oe_policy_versions (version, active, changed_by, reason, params, rubric)
VALUES (
  '1.0', true, 'founder', 'Opportunity Engine v1.0 (17 Sep 2026)',
  '{"cards_per_day":1,"explore_share":0.2,"shortlist_k":50,"judge_passes":2,"gate_min_avg":3.0,"gate_no_zero":true,"bands":{"strong":3.4,"worth_a_look":3.0},"face_weights_default":{"done":0.20,"wants":0.30,"reads":0.20,"stands":0.20,"avoid":-1},"ema_alpha":0.2,"decay_days":{"not_quite":42,"not_my_area":90},"few_shot_k":8,"dedup_cosine":0.92,"empty_day_alarm_run":3,"max_member_share":0.15,"outcome_ask_after_days":14,"token_ttl_days":21,"channels":{"daily":"email","weekly_digest":"whatsapp_when_paired"},"never_read":["linkedin.com","etimad.sa","chat.whatsapp.com"]}'::jsonb,
  '{"version":"1.0","questions":["role_fit","sector_fit","seniority_fit","timing","strategic_value"],"scale":"0-4","weights":{"role_fit":0.30,"sector_fit":0.20,"seniority_fit":0.15,"timing":0.15,"strategic_value":0.20},"gate":"weighted_avg>=3.0 and no question 0 and quote_verified","win_rubric":["eligibility_met","past_winner_similarity","issuer_history"]}'::jsonb
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO public.oe_feeds (name, lane, kind, url, issuer_hint, language, chair_types, read_method, cadence, terms_ok, active)
SELECT v.name, v.lane, v.kind, v.url, v.issuer_hint, v.language, v.chair_types::text[], v.read_method, v.cadence, false, true
FROM (VALUES
 ('Saudi Exchange issuer announcements — Opening of the Nomination','official','listing','https://www.saudiexchange.sa/wps/portal/saudiexchange/newsandreports/issuer-news/issuer-announcements','Saudi Exchange','ar','{board}','listing scrape, filter فتح باب الترشح / Opening of the Nomination','daily'),
 ('Capital Market Authority announcements','official','listing','https://cma.gov.sa','CMA','ar','{board}','listing scrape','daily'),
 ('Saudi Exchange listing and IPO applications','official','listing','https://www.saudiexchange.sa','Saudi Exchange','ar','{board}','early signal: IPO/listing application → board formation','weekly'),
 ('MCIT newsroom','official','listing','https://www.mcit.gov.sa','MCIT','ar','{mandate,role}','RSS if offered else change detection','daily'),
 ('MISA newsroom','official','listing','https://www.misa.gov.sa','MISA','ar','{mandate,role}','change detection','daily'),
 ('HRSD newsroom','official','listing','https://www.hrsd.gov.sa','HRSD','ar','{mandate,role}','change detection','daily'),
 ('Digital Government Authority newsroom','official','listing','https://dga.gov.sa','DGA','ar','{mandate,role}','change detection','daily'),
 ('SDAIA newsroom','official','listing','https://sdaia.gov.sa','SDAIA','ar','{mandate,role}','change detection','daily'),
 ('Meta Ad Library — Saudi recruitment and launch ads','official','api','https://www.facebook.com/ads/library/api','Meta','ar','{role,mandate}','official Ad Library API; early signal','daily'),
 ('Etimad reseller feed — advisory and IT categories','licensed','api',NULL,'Etimad via licensed reseller','ar','{mandate,advisory}','licensed API; provenance in writing before activation','daily'),
 ('JSearch — Director and above, sa/ae/qa/om','licensed','api',NULL,'JSearch','en','{role}','licensed API','daily'),
 ('Journalist requests — Middle East (licensed)','licensed','api',NULL,'Telum Media','en','{media}','licensed platform; pass-through rights to confirm','daily'),
 ('World Bank procurement notices','official','api','https://search.worldbank.org/api/v2/procnotices','World Bank','en','{mandate}','open API CC-BY 4.0','weekly'),
 ('Luma — Riyadh executive events','open','calendar','https://lu.ma/riyadh','Luma','en','{room,learning}','public calendar feed','daily'),
 ('Luma — Jeddah executive events','open','calendar','https://lu.ma/jeddah','Luma','en','{room,learning}','public calendar feed','daily'),
 ('Sessionize — Gulf calls for speakers','open','listing','https://sessionize.com','Sessionize','en','{speaking}','public event pages','weekly'),
 ('SaudiCon event calendar','open','calendar','https://saudicon.app','SaudiCon','en','{room,speaking,learning}','public calendar','daily'),
 ('Telegram — صدى السعودية','open','telegram',NULL,'صدى السعودية','ar','{board,mandate,role,room}','public web preview t.me/s/<slug>; slug to confirm; early signals','daily'),
 ('Telegram — آفاق الأعمال','open','telegram',NULL,'آفاق الأعمال','ar','{board,mandate,role}','public web preview t.me/s/<slug>; slug to confirm; early signals','daily'),
 ('GITEX Global speaker interest form','open','manual','https://mktg.gitex.com/GITEX2026SpeakerInterest','GITEX','en','{speaking}','manual, standing','monthly'),
 ('Opinion desks accepting submissions (Arab News op-eds)','open','manual','https://www.arabnews.com/node/1281216/op-eds','Arab News','en','{media}','manual, standing','monthly'),
 ('Member-forwarded messages (WhatsApp, Telegram, LinkedIn, groups)','member','member_forward',NULL,NULL,'ar','{board,mandate,role,room,speaking,media,advisory,award,learning}','read from entries with source_type = member_forward, per member only; searched for public twins','daily'),
 ('Discovery — Perplexity sonar from member faces','open','api',NULL,'Perplexity','ar','{board,mandate,role,room,speaking}','LLM proposes, source verifies; at most 30 queries per night; never stored without a resolved source URL','daily')
) AS v(name, lane, kind, url, issuer_hint, language, chair_types, read_method, cadence)
ON CONFLICT DO NOTHING;

INSERT INTO public.oe_consents (user_id, kind, version)
SELECT u.id, k.kind, '1.0'
FROM auth.users u
CROSS JOIN (VALUES ('matching'), ('forwarding')) AS k(kind)
WHERE u.id = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'
ON CONFLICT (user_id, kind, version) DO NOTHING;
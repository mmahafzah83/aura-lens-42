
-- ============ BOOK ONE — the member's own rules ============
CREATE TABLE IF NOT EXISTS public.oe_notebook (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('hard','soft')),
  rule_text text NOT NULL,
  rule_text_ar text,
  field text CHECK (field IN ('issuer','level','place','chair_type','sector','requirement')),
  op text CHECK (op IN ('exclude','prefer','require')),
  value text,
  origin text NOT NULL CHECK (origin IN ('stated','signed')),
  proposal_status text NOT NULL DEFAULT 'signed' CHECK (proposal_status IN ('open','signed','declined')),
  proposed_because jsonb,
  stated_on date NOT NULL DEFAULT CURRENT_DATE,
  expires_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.oe_notebook IS 'Book One. Taste. One member''s own sentences. Never leaves this member.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_notebook TO authenticated;
GRANT ALL ON public.oe_notebook TO service_role;
ALTER TABLE public.oe_notebook ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notebook owner read" ON public.oe_notebook FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notebook owner write" ON public.oe_notebook FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notebook owner edit" ON public.oe_notebook FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "notebook owner delete" ON public.oe_notebook FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS oe_notebook_user_idx ON public.oe_notebook (user_id, active, proposal_status);

CREATE OR REPLACE FUNCTION public.oe_notebook_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.origin = 'signed' AND NEW.proposal_status <> 'signed' THEN
    RAISE EXCEPTION 'a signed rule must carry proposal_status = signed';
  END IF;
  IF NEW.kind = 'hard' THEN NEW.expires_at := NULL; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER oe_notebook_guard_trg BEFORE INSERT OR UPDATE ON public.oe_notebook
  FOR EACH ROW EXECUTE FUNCTION public.oe_notebook_guard();

-- Book One is the truth; oe_eligibility is its cache.
CREATE OR REPLACE FUNCTION public.oe_rebuild_eligibility(p_user uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_places text[]; v_blocked text[]; v_ceiling text; v_sectors text[];
  v_reasons jsonb; v_rules jsonb;
BEGIN
  SELECT array_agg(DISTINCT upper(value)) INTO v_places FROM oe_notebook
    WHERE user_id = p_user AND active AND kind = 'hard' AND proposal_status = 'signed'
      AND field = 'place' AND op = 'require' AND value IS NOT NULL;
  SELECT array_agg(DISTINCT value) INTO v_blocked FROM oe_notebook
    WHERE user_id = p_user AND active AND kind = 'hard' AND proposal_status = 'signed'
      AND field = 'chair_type' AND op = 'exclude' AND value IS NOT NULL;
  SELECT value INTO v_ceiling FROM oe_notebook
    WHERE user_id = p_user AND active AND kind = 'hard' AND proposal_status = 'signed'
      AND field = 'level' AND op = 'exclude' AND value IS NOT NULL
    ORDER BY stated_on DESC, created_at DESC LIMIT 1;
  SELECT array_agg(DISTINCT value) INTO v_sectors FROM oe_notebook
    WHERE user_id = p_user AND active AND proposal_status = 'signed'
      AND field = 'sector' AND op IN ('prefer','require') AND value IS NOT NULL;
  SELECT jsonb_object_agg(value, rule_text) INTO v_reasons FROM (
    SELECT DISTINCT ON (value) value, rule_text FROM oe_notebook
      WHERE user_id = p_user AND active AND proposal_status = 'signed'
        AND field = 'chair_type' AND op = 'exclude' AND value IS NOT NULL
      ORDER BY value, stated_on DESC) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'said_on', stated_on, 'text', rule_text,
           'applies_to', COALESCE(field,'') || ':' || COALESCE(value,'')) ORDER BY stated_on), '[]'::jsonb)
    INTO v_rules FROM oe_notebook
    WHERE user_id = p_user AND active AND proposal_status = 'signed';

  INSERT INTO oe_eligibility (user_id, countries_allowed, chair_types_blocked, level_ceiling,
                              sectors_core, blocked_reasons, stated_rules)
  VALUES (p_user, COALESCE(v_places, '{}'), COALESCE(v_blocked, '{}'), v_ceiling,
          COALESCE(v_sectors, '{}'), COALESCE(v_reasons, '{}'::jsonb), v_rules)
  ON CONFLICT (user_id) DO UPDATE SET
    countries_allowed   = COALESCE(v_places, oe_eligibility.countries_allowed),
    chair_types_blocked = COALESCE(v_blocked, '{}'),
    level_ceiling       = COALESCE(v_ceiling, oe_eligibility.level_ceiling),
    sectors_core        = COALESCE(v_sectors, oe_eligibility.sectors_core),
    blocked_reasons     = COALESCE(v_reasons, '{}'::jsonb),
    stated_rules        = v_rules,
    updated_at          = now();
END $$;

CREATE OR REPLACE FUNCTION public.oe_notebook_rebuild() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.oe_rebuild_eligibility(COALESCE(NEW.user_id, OLD.user_id));
  RETURN NULL;
END $$;
CREATE TRIGGER oe_notebook_rebuild_trg AFTER INSERT OR UPDATE OR DELETE ON public.oe_notebook
  FOR EACH ROW EXECUTE FUNCTION public.oe_notebook_rebuild();

-- ============ BOOK TWO — what we gave them, and what they did ============
CREATE TABLE IF NOT EXISTS public.oe_serves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid,
  opportunity_id uuid,
  shown_at timestamptz NOT NULL DEFAULT now(),
  channel text CHECK (channel IN ('email','app','test')),
  lane text CHECK (lane IN ('act','write')),
  why jsonb NOT NULL DEFAULT '{}'::jsonb,
  tap text CHECK (tap IN ('right','not_quite','not_my_area')),
  tapped_at timestamptz,
  tap_scope text,
  tap_scope_value text,
  signal_class text CHECK (signal_class IN ('taste','truth')),
  truth_code text CHECK (truth_code IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer')),
  pursued boolean,
  pursued_at timestamptz,
  outcome text CHECK (outcome IN ('applied','shortlisted','won','nothing','asked')),
  outcome_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.oe_serves IS 'Book Two. One member''s served cards and answers. Never leaves this member.';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_serves TO authenticated;
GRANT ALL ON public.oe_serves TO service_role;
ALTER TABLE public.oe_serves ENABLE ROW LEVEL SECURITY;
CREATE POLICY "serves owner read" ON public.oe_serves FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "serves owner write" ON public.oe_serves FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "serves owner edit" ON public.oe_serves FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "serves owner delete" ON public.oe_serves FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS oe_serves_user_idx ON public.oe_serves (user_id, shown_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS oe_serves_card_idx ON public.oe_serves (card_id) WHERE card_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.oe_suppressed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day date NOT NULL DEFAULT CURRENT_DATE,
  opportunity_id uuid,
  reason text,
  rank int,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_suppressed TO authenticated;
GRANT ALL ON public.oe_suppressed TO service_role;
ALTER TABLE public.oe_suppressed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppressed owner read" ON public.oe_suppressed FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "suppressed owner write" ON public.oe_suppressed FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppressed owner edit" ON public.oe_suppressed FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "suppressed owner delete" ON public.oe_suppressed FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS oe_suppressed_user_day_idx ON public.oe_suppressed (user_id, day DESC);

CREATE TABLE IF NOT EXISTS public.oe_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid,
  label text NOT NULL,
  why text,
  note text,
  labelled_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'calibration_01',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_labels TO authenticated;
GRANT ALL ON public.oe_labels TO service_role;
ALTER TABLE public.oe_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "labels owner read" ON public.oe_labels FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "labels owner write" ON public.oe_labels FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "labels owner edit" ON public.oe_labels FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "labels owner delete" ON public.oe_labels FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.oe_learning_stage (
  user_id uuid PRIMARY KEY,
  stage int NOT NULL DEFAULT 0,
  labels_count int NOT NULL DEFAULT 0,
  outcomes_count int NOT NULL DEFAULT 0,
  promoted_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_learning_stage TO authenticated;
GRANT ALL ON public.oe_learning_stage TO service_role;
ALTER TABLE public.oe_learning_stage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage owner read" ON public.oe_learning_stage FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============ BOOK THREE — global. NO user_id column, by design. ============
CREATE TABLE IF NOT EXISTS public.oe_source_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  surface_id uuid REFERENCES public.oe_surfaces(id) ON DELETE CASCADE,
  feed_id uuid REFERENCES public.oe_feeds(id) ON DELETE CASCADE,
  window_days int NOT NULL DEFAULT 28,
  items_pulled int NOT NULL DEFAULT 0,
  items_kept int NOT NULL DEFAULT 0,
  yield numeric,
  median_discovery_lag_hours numeric,
  route_death_rate numeric,
  quote_fail_rate numeric,
  last_ok_at timestamptz,
  cadence text,
  computed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.oe_source_facts IS 'Book Three. Truth about sources. Holds no member column so no preference can be written here.';
GRANT SELECT ON public.oe_source_facts TO authenticated;
GRANT ALL ON public.oe_source_facts TO service_role;
ALTER TABLE public.oe_source_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "source facts readable" ON public.oe_source_facts FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS oe_source_facts_computed_idx ON public.oe_source_facts (computed_at DESC);

CREATE TABLE IF NOT EXISTS public.oe_world_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('issuer_clock','aggregator_fingerprint','recurring_event','term_window','route_pattern')),
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_url text,
  evidence_quote text,
  confidence numeric,
  computed_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.oe_world_facts IS 'Book Three. Truth about the world. Holds no member column so no preference can be written here.';
GRANT SELECT ON public.oe_world_facts TO authenticated;
GRANT ALL ON public.oe_world_facts TO service_role;
ALTER TABLE public.oe_world_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "world facts readable" ON public.oe_world_facts FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS oe_world_facts_kind_idx ON public.oe_world_facts (kind, computed_at DESC);


-- ── A) RULES BY CONSENT ────────────────────────────────────────────────────
ALTER TABLE public.oe_notebook
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS values text[];

DO $$ BEGIN
  ALTER TABLE public.oe_notebook
    ADD CONSTRAINT oe_notebook_status_check CHECK (status IN ('proposed','active','declined'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.oe_notebook
   SET status = 'proposed', active = false
 WHERE origin = 'derived' AND ratified_at IS NULL;

UPDATE public.oe_notebook
   SET status = 'active'
 WHERE (origin = 'stated' OR ratified_at IS NOT NULL) AND status <> 'declined';

CREATE OR REPLACE FUNCTION public.oe_notebook_consent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.active IS TRUE AND NEW.origin = 'derived' AND NEW.ratified_at IS NULL THEN
    RAISE EXCEPTION 'a rule worked out from the profile stays a proposal until the member ratifies it';
  END IF;
  IF NEW.active IS TRUE AND NEW.status = 'proposed' THEN
    RAISE EXCEPTION 'a proposed rule is never active';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS oe_notebook_consent_guard ON public.oe_notebook;
CREATE TRIGGER oe_notebook_consent_guard
  BEFORE INSERT OR UPDATE ON public.oe_notebook
  FOR EACH ROW EXECUTE FUNCTION public.oe_notebook_consent_guard();

-- Eligibility is rebuilt from ratified, active rules only.
CREATE OR REPLACE FUNCTION public.oe_rebuild_eligibility(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_places text[]; v_blocked text[]; v_never text[]; v_sectors text[];
  v_reasons jsonb; v_rules jsonb;
BEGIN
  SELECT array_agg(DISTINCT upper(x)) INTO v_places FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'place' AND n.op IN ('require','allow') AND x IS NOT NULL;
  SELECT array_agg(DISTINCT value) INTO v_blocked FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'rule' AND active AND status='active' AND ratified_at IS NOT NULL
      AND field = 'chair_type' AND op = 'exclude' AND value IS NOT NULL;
  SELECT array_agg(DISTINCT value) INTO v_never FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'rule' AND active AND status='active' AND ratified_at IS NOT NULL
      AND field = 'chair_type' AND op = 'never_held' AND value IS NOT NULL;
  SELECT array_agg(DISTINCT x) INTO v_sectors FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'sector' AND n.op IN ('prefer','require','allow') AND x IS NOT NULL;
  SELECT jsonb_object_agg(value, rule_text) INTO v_reasons FROM (
    SELECT DISTINCT ON (value) value, rule_text FROM oe_notebook
      WHERE user_id = p_user AND entry_kind = 'rule' AND active AND status='active' AND ratified_at IS NOT NULL
        AND field = 'chair_type' AND op = 'exclude' AND value IS NOT NULL
      ORDER BY value, stated_on DESC) s;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'said_on', stated_on, 'text', rule_text,
           'applies_to', COALESCE(field,'') || ':' || COALESCE(value,'')) ORDER BY stated_on), '[]'::jsonb)
    INTO v_rules FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'comment' AND active;

  INSERT INTO oe_eligibility (user_id, countries_allowed, chair_types_blocked, chair_types_never_held,
                              level_ceiling, level_floor, sectors_core, blocked_reasons, stated_rules)
  VALUES (p_user, COALESCE(v_places, '{}'), COALESCE(v_blocked, '{}'), COALESCE(v_never, '{}'),
          NULL, NULL, COALESCE(v_sectors, '{}'), COALESCE(v_reasons, '{}'::jsonb), v_rules)
  ON CONFLICT (user_id) DO UPDATE SET
    countries_allowed      = COALESCE(v_places, '{}'),
    chair_types_blocked    = COALESCE(v_blocked, '{}'),
    chair_types_never_held = COALESCE(v_never, '{}'),
    level_ceiling = NULL, level_floor = NULL,
    sectors_core           = COALESCE(v_sectors, '{}'),
    blocked_reasons        = COALESCE(v_reasons, '{}'::jsonb),
    stated_rules           = v_rules,
    updated_at             = now();
END $function$;

-- ── B) REFERENCE TABLES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oe_ref_regions (
  code text PRIMARY KEY, name_en text NOT NULL, name_ar text NOT NULL, sort int NOT NULL DEFAULT 0);
GRANT SELECT ON public.oe_ref_regions TO authenticated, anon;
GRANT ALL ON public.oe_ref_regions TO service_role;
ALTER TABLE public.oe_ref_regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oe_ref_regions_read ON public.oe_ref_regions;
CREATE POLICY oe_ref_regions_read ON public.oe_ref_regions FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.oe_ref_countries (
  iso2 text PRIMARY KEY, name_en text NOT NULL, name_ar text NOT NULL,
  region_codes text[] NOT NULL DEFAULT '{}');
GRANT SELECT ON public.oe_ref_countries TO authenticated, anon;
GRANT ALL ON public.oe_ref_countries TO service_role;
ALTER TABLE public.oe_ref_countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oe_ref_countries_read ON public.oe_ref_countries;
CREATE POLICY oe_ref_countries_read ON public.oe_ref_countries FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.oe_ref_sectors (
  code text PRIMARY KEY, name_en text NOT NULL, name_ar text NOT NULL, sort int NOT NULL DEFAULT 0);
GRANT SELECT ON public.oe_ref_sectors TO authenticated, anon;
GRANT ALL ON public.oe_ref_sectors TO service_role;
ALTER TABLE public.oe_ref_sectors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oe_ref_sectors_read ON public.oe_ref_sectors;
CREATE POLICY oe_ref_sectors_read ON public.oe_ref_sectors FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.oe_ref_levels (
  code text PRIMARY KEY, rank int NOT NULL, name_en text NOT NULL, name_ar text NOT NULL);
GRANT SELECT ON public.oe_ref_levels TO authenticated, anon;
GRANT ALL ON public.oe_ref_levels TO service_role;
ALTER TABLE public.oe_ref_levels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oe_ref_levels_read ON public.oe_ref_levels;
CREATE POLICY oe_ref_levels_read ON public.oe_ref_levels FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.oe_ref_engagements (
  code text PRIMARY KEY, name_en text NOT NULL, name_ar text NOT NULL, sort int NOT NULL DEFAULT 0);
GRANT SELECT ON public.oe_ref_engagements TO authenticated, anon;
GRANT ALL ON public.oe_ref_engagements TO service_role;
ALTER TABLE public.oe_ref_engagements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oe_ref_engagements_read ON public.oe_ref_engagements;
CREATE POLICY oe_ref_engagements_read ON public.oe_ref_engagements FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.oe_ref_org_types (
  code text PRIMARY KEY, name_en text NOT NULL, name_ar text NOT NULL, sort int NOT NULL DEFAULT 0);
GRANT SELECT ON public.oe_ref_org_types TO authenticated, anon;
GRANT ALL ON public.oe_ref_org_types TO service_role;
ALTER TABLE public.oe_ref_org_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oe_ref_org_types_read ON public.oe_ref_org_types;
CREATE POLICY oe_ref_org_types_read ON public.oe_ref_org_types FOR SELECT USING (true);

-- One row per field per member.
CREATE UNIQUE INDEX IF NOT EXISTS oe_notebook_one_filter_per_field
  ON public.oe_notebook (user_id, field)
  WHERE entry_kind = 'rule' AND origin = 'stated' AND field IS NOT NULL AND values IS NOT NULL;

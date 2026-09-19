
-- ============ Item 1: the five-state ladder ============
ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS access_state text,
  ADD COLUMN IF NOT EXISTS access_state_reason text,
  ADD COLUMN IF NOT EXISTS access_state_at timestamptz;

ALTER TABLE public.oe_opportunities DROP CONSTRAINT IF EXISTS oe_opportunities_access_state_check;
ALTER TABLE public.oe_opportunities ADD CONSTRAINT oe_opportunities_access_state_check
  CHECK (access_state IS NULL OR access_state IN ('observed_event','possible_need','confirmed_opportunity','identified_route'));

ALTER TABLE public.oe_matches
  ADD COLUMN IF NOT EXISTS member_access_confirmed boolean NOT NULL DEFAULT false;

-- A front door anyone can walk through is not a route.
CREATE OR REPLACE FUNCTION public.oe_route_is_specific(p_url text, p_kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_url IS NULL OR NULLIF(trim(p_url),'') IS NULL THEN false
    WHEN COALESCE(p_kind,'none') IN ('none','contact','registration','press','newsroom') THEN false
    WHEN lower(p_url) ~ '(/membership|get-involved|getinvolved|/contact|/about|/press|/news/?$|/careers/?$|/jobs/?$|/join|/partner(s)?/?$|/media)' THEN false
    WHEN COALESCE(p_kind,'') IN ('application','tender','named_person','role_page') THEN true
    ELSE false END
$$;

-- State from evidence, never from lane.
CREATE OR REPLACE FUNCTION public.oe_derive_access_state()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  WITH d AS (
    SELECT o.id,
      CASE
        WHEN public.oe_route_is_specific(o.route_url, o.route_kind) AND COALESCE(o.route_dead,false) IS FALSE
          THEN 'identified_route'
        WHEN o.time_kind = 'open_now'
          OR (o.chair_type IN ('role','seat') AND COALESCE(jsonb_array_length(COALESCE(o.requirements,'[]'::jsonb)),0) > 0)
          OR o.deadline IS NOT NULL
          THEN 'confirmed_opportunity'
        WHEN o.time_kind IN ('early_signal','forming') THEN 'possible_need'
        ELSE 'observed_event' END AS st
    FROM oe_opportunities o
  )
  UPDATE oe_opportunities o
     SET access_state = d.st,
         access_state_at = now(),
         access_state_reason = CASE d.st
           WHEN 'identified_route' THEN 'A channel specific to this opportunity exists: '||COALESCE(o.route_kind,'')
           WHEN 'confirmed_opportunity' THEN 'Evidence of an actual opening or invitation'
           WHEN 'possible_need' THEN 'A need is inferred from the event, not stated'
           ELSE 'An event was observed; no need has been inferred' END
    FROM d WHERE d.id=o.id AND (o.access_state IS DISTINCT FROM d.st OR o.access_state IS NULL);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

SELECT public.oe_derive_access_state();

-- LAW: the act lane requires a specific route.
CREATE OR REPLACE FUNCTION public.oe_matches_act_requires_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_state text;
BEGIN
  IF NEW.lane_final = 'act' THEN
    SELECT access_state INTO v_state FROM oe_opportunities WHERE id = NEW.opportunity_id;
    IF COALESCE(v_state,'observed_event') <> 'identified_route' AND NEW.member_access_confirmed IS NOT TRUE THEN
      NEW.lane_final := 'write';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oe_matches_act_requires_route ON public.oe_matches;
CREATE TRIGGER trg_oe_matches_act_requires_route
  BEFORE INSERT OR UPDATE ON public.oe_matches
  FOR EACH ROW EXECUTE FUNCTION public.oe_matches_act_requires_route();

-- Re-apply to existing rows.
UPDATE oe_matches m SET lane_final='write'
  FROM oe_opportunities o
 WHERE o.id=m.opportunity_id AND m.lane_final='act'
   AND COALESCE(o.access_state,'observed_event') <> 'identified_route'
   AND m.member_access_confirmed IS NOT TRUE;

-- ============ Item 2: unknown is not ineligible ============
CREATE TABLE IF NOT EXISTS public.oe_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  field text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','unresolvable')),
  attempts integer NOT NULL DEFAULT 0,
  resolved_value text,
  reason text,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id, field)
);

GRANT SELECT ON public.oe_investigations TO authenticated;
GRANT ALL ON public.oe_investigations TO service_role;
ALTER TABLE public.oe_investigations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own investigations" ON public.oe_investigations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_oe_investigations_updated
  BEFORE UPDATE ON public.oe_investigations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Place resolver: stated location text to a country code.
CREATE OR REPLACE FUNCTION public.oe_place_country(p_location text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN l = '' THEN NULL
    WHEN l ~ '(saudi|riyadh|jeddah|dammam|khobar|makkah|mecca|medina|neom|ksa|السعودي|الرياض|جدة)' THEN 'SA'
    WHEN l ~ '(u\.a\.e|\buae\b|dubai|abu dhabi|emirat|sharjah|الإمارات|دبي)' THEN 'AE'
    WHEN l ~ '(qatar|doha|قطر)' THEN 'QA'
    WHEN l ~ '(kuwait|الكويت)' THEN 'KW'
    WHEN l ~ '(bahrain|manama|البحرين)' THEN 'BH'
    WHEN l ~ '(\boman\b|muscat|عمان)' THEN 'OM'
    WHEN l ~ '(jordan|amman|الأردن)' THEN 'JO'
    WHEN l ~ '(egypt|cairo|kafr|مصر)' THEN 'EG'
    WHEN l ~ 'lebanon|beirut' THEN 'LB'
    WHEN l ~ 'sudan' THEN 'SD'
    WHEN l ~ 'brazil' THEN 'BR'
    WHEN l ~ 'gambia' THEN 'GM'
    WHEN l ~ 'rwanda' THEN 'RW'
    WHEN l ~ 'tanzania' THEN 'TZ'
    WHEN l ~ 'uzbekistan' THEN 'UZ'
    WHEN l ~ '(cote d|côte d|ivoire)' THEN 'CI'
    WHEN l ~ 'tunisia|tunisie' THEN 'TN'
    WHEN l ~ 'nepal|kathmandu' THEN 'NP'
    WHEN l ~ 'kazakhstan' THEN 'KZ'
    WHEN l ~ 'madagascar' THEN 'MG'
    WHEN l ~ 'marshall islands' THEN 'MH'
    WHEN l ~ 'denmark|copenhagen' THEN 'DK'
    WHEN l ~ 'birmingham|london|united kingdom|\buk\b' THEN 'GB'
    WHEN l ~ 'turkey|türkiye|istanbul|ankara' THEN 'TR'
    WHEN l ~ 'washington|new york|united states|\busa\b' THEN 'US'
    WHEN l ~ '(global|international|worldwide|multiple countries|various|pacific islands|remote)' THEN 'UNSPECIFIED'
    ELSE NULL END
  FROM (SELECT lower(trim(COALESCE(p_location,''))) AS l) t
$$;

-- Investigate the unknowns for one member; resolve what the record itself settles.
CREATE OR REPLACE FUNCTION public.oe_investigate_unknowns(p_user uuid)
RETURNS TABLE(opportunity_id uuid, title text, field text, outcome text, detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_country text; v_allowed text[]; v_unknowns text[]; v_fails text[]; v_outcome text; v_detail text;
BEGIN
  SELECT countries_allowed INTO v_allowed FROM oe_eligibility WHERE user_id=p_user;
  v_allowed := COALESCE(v_allowed, '{}'::text[]);

  FOR r IN
    SELECT m.id match_id, o.id opp_id, o.title, o.location,
           COALESCE(m.eligibility_unknowns,'{}'::text[]) unk,
           COALESCE(m.eligibility_fail,'{}'::text[]) fails
      FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
     WHERE m.user_id=p_user AND o.alive AND m.eligibility_outcome='unknown'
  LOOP
    v_unknowns := r.unk; v_fails := r.fails;
    IF 'place_unknown' = ANY(r.unk) THEN
      v_country := public.oe_place_country(r.location);
      IF v_country IS NOT NULL AND v_country <> 'UNSPECIFIED' THEN
        v_unknowns := array_remove(v_unknowns,'place_unknown');
        IF array_length(v_allowed,1) IS NOT NULL AND NOT (v_country = ANY(v_allowed)) THEN
          v_fails := (SELECT array_agg(DISTINCT x) FROM unnest(v_fails || ARRAY['place']) x);
          v_outcome := 'excluded';
          v_detail := 'Stated location resolves to '||v_country||', outside the countries he works in';
        ELSE
          v_outcome := NULL;
          v_detail := 'Stated location resolves to '||v_country||', inside the countries he works in';
        END IF;
        INSERT INTO oe_investigations(user_id,opportunity_id,field,status,attempts,resolved_value,reason,last_attempt_at)
        VALUES (p_user,r.opp_id,'place','resolved',1,v_country,v_detail,now())
        ON CONFLICT (user_id,opportunity_id,field) DO UPDATE
          SET status='resolved', attempts=oe_investigations.attempts+1, resolved_value=EXCLUDED.resolved_value,
              reason=EXCLUDED.reason, last_attempt_at=now();
      ELSE
        v_outcome := 'unknown';
        v_detail := COALESCE('Location is stated only as "'||r.location||'"','Location is not stated');
        INSERT INTO oe_investigations(user_id,opportunity_id,field,status,attempts,reason,last_attempt_at)
        VALUES (p_user,r.opp_id,'place','open',1,v_detail,now())
        ON CONFLICT (user_id,opportunity_id,field) DO UPDATE
          SET attempts=oe_investigations.attempts+1, reason=EXCLUDED.reason, last_attempt_at=now();
      END IF;
    END IF;

    IF v_outcome IS NULL THEN
      v_outcome := CASE WHEN array_length(v_unknowns,1) IS NULL THEN 'eligible' ELSE 'unknown' END;
    END IF;

    UPDATE oe_matches SET eligibility_unknowns=v_unknowns, eligibility_fail=v_fails,
           eligibility_outcome=v_outcome
     WHERE id=r.match_id;

    opportunity_id := r.opp_id; title := r.title; field := 'place'; outcome := v_outcome; detail := v_detail;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.oe_investigate_unknowns(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_investigate_unknowns(uuid) TO service_role;

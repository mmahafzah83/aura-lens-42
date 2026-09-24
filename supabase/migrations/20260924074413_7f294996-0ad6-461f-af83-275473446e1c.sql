ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS work_arrangement text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS work_arrangement_basis text,
  ADD COLUMN IF NOT EXISTS work_arrangement_quote text,
  ADD COLUMN IF NOT EXISTS applicant_regions text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.oe_opportunities DROP CONSTRAINT IF EXISTS oe_opportunities_work_arrangement_check;
ALTER TABLE public.oe_opportunities ADD CONSTRAINT oe_opportunities_work_arrangement_check
  CHECK (work_arrangement IN ('onsite','hybrid','remote','unknown'));
ALTER TABLE public.oe_opportunities DROP CONSTRAINT IF EXISTS oe_opportunities_work_arrangement_basis_check;
ALTER TABLE public.oe_opportunities ADD CONSTRAINT oe_opportunities_work_arrangement_basis_check
  CHECK (work_arrangement_basis IS NULL OR work_arrangement_basis IN ('structured','title','location_field','role_text','model'));

ALTER TABLE public.oe_eligibility ADD COLUMN IF NOT EXISTS places_source text NOT NULL DEFAULT 'default';
ALTER TABLE public.oe_eligibility DROP CONSTRAINT IF EXISTS oe_eligibility_places_source_check;
ALTER TABLE public.oe_eligibility ADD CONSTRAINT oe_eligibility_places_source_check CHECK (places_source IN ('member','default'));

ALTER TABLE public.oe_cards
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text;

CREATE OR REPLACE FUNCTION public.oe_regions_in_text(p_text text)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  with t as (select ' ' || lower(coalesce(p_text,'')) || ' ' s),
  hits as (
    select upper(c.iso2) code from oe_ref_countries c, t
     where position(' ' || lower(c.name_en) || ' ' in regexp_replace(t.s, '[^a-z ]', ' ', 'g')) > 0
    union select r.code from oe_ref_regions r, t
     where r.code <> 'WORLD' and (position(' ' || lower(r.name_en) || ' ' in regexp_replace(t.s, '[^a-z ]', ' ', 'g')) > 0
                                  or position(' ' || lower(r.code) || ' ' in regexp_replace(t.s, '[^a-z ]', ' ', 'g')) > 0)
    union select a.code from t, (values ('uae','AE'),('ksa','SA'),('saudi','SA'),('uk','GB'),('usa','US'),
        ('emea','EU'),('emea','MENA'),('emea','AFRICA'),('middle east','MENA'),('gulf','GCC')) a(k, code)
     where position(' ' || a.k || ' ' in regexp_replace(t.s, '[^a-z ]', ' ', 'g')) > 0
  )
  select coalesce(array_agg(distinct code), '{}') from hits
$$;

CREATE OR REPLACE FUNCTION public.oe_remote_reaches(p_residence text, p_regions text[])
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  select coalesce(cardinality(p_regions),0) = 0
      or 'WORLD' = any(p_regions)
      or upper(coalesce(p_residence,'')) = any(p_regions)
      or exists (select 1 from oe_ref_countries c where c.iso2 = upper(coalesce(p_residence,''))
                 and c.region_codes && p_regions)
$$;

CREATE OR REPLACE FUNCTION public.oe_classify_work_arrangement(
  p_title text, p_location text, p_page text, p_structured jsonb,
  OUT arrangement text, OUT basis text, OUT quote text, OUT regions text[])
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_s text; v_isr text; v_sent text; v_perk boolean := false;
  v_hyb text; v_rem text; v_ons text;
  c_hyb constant text := '(hybrid|flexible work|remote working option|remote-friendly|remote friendly|days? (a |per )?(week )?(in|at|from) (the |our )?office|days? in (the )?office|هجين|عمل مرن)';
  c_rem constant text := '(fully remote|100% remote|remote[- ]first|remote[- ]only|work from anywhere|work from home|work remotely|remote (role|position|job|opportunity)|(role|position) is remote|remote within|remote in |remote across|عن بعد بالكامل|العمل عن بعد)';
  c_ons constant text := '(on-?site|office-based|office based|in-office|fully office|based (in|at|out of) (our|the) [a-z ]{0,40}office|حضوري)';
  c_perk_head constant text := '(benefit|perk|what we offer|we offer|why join|why work|love working|our culture|life at|employee value|total reward|rewards|package|in it for you|about us|about the company|المزايا|لماذا تنضم)';
  c_perk constant text := '(benefit|perk|we offer|offers? (a |an |competitive|flexible|attractive)|offering|work-life|work life balance|wellbeing|well-being|insurance|annual leave|paid leave|discount|allowance|eligib|subject to|culture|we understand|we value|our people|compensation|reward|equal opportunit)';
  c_role_head constant text := '(responsibilit|requirement|qualification|what you will do|you will|the role|key accountab|duties|job description|looking for|المهام|المتطلبات)';
BEGIN
  arrangement := 'unknown'; basis := NULL; quote := NULL; regions := '{}';

  IF p_structured IS NOT NULL AND jsonb_typeof(p_structured) = 'object' THEN
    v_s := lower(coalesce(p_structured->>'jobLocationType', p_structured->>'workplaceType',
                          p_structured->>'workplace_type', p_structured->>'workplace', ''));
    v_isr := lower(coalesce(p_structured->>'isRemote', p_structured->>'remote', ''));
    IF v_s ~ 'hybrid' THEN arrangement := 'hybrid';
    ELSIF v_s ~ '(telecommute|remote)' OR v_isr = 'true' THEN arrangement := 'remote';
    ELSIF v_s ~ '(on.?site|office)' OR v_isr = 'false' THEN arrangement := 'onsite';
    END IF;
    IF arrangement <> 'unknown' THEN
      basis := 'structured';
      quote := left(nullif(trim(concat_ws(' ', nullif(v_s,''), CASE WHEN v_isr <> '' THEN 'isRemote=' || v_isr END)),''), 300);
      IF arrangement = 'remote' AND p_structured ? 'applicantLocationRequirements' THEN
        regions := public.oe_regions_in_text(p_structured->>'applicantLocationRequirements');
      END IF;
      RETURN;
    END IF;
  END IF;

  IF coalesce(p_title,'') ~* c_hyb THEN arrangement := 'hybrid'; basis := 'title'; quote := left(p_title,300); RETURN; END IF;
  IF coalesce(p_title,'') ~* '(\mremote\M|work from home|\mwfh\M|\manywhere\M|عن بعد)' THEN
    arrangement := 'remote'; basis := 'title'; quote := left(p_title,300);
    regions := public.oe_regions_in_text(p_title || ' ' || coalesce(p_location,'')); RETURN;
  END IF;
  IF coalesce(p_location,'') ~* c_hyb THEN arrangement := 'hybrid'; basis := 'location_field'; quote := left(p_location,300); RETURN; END IF;
  IF coalesce(p_location,'') ~* '(\mremote\M|work from home|\manywhere\M|عن بعد)' THEN
    arrangement := 'remote'; basis := 'location_field'; quote := left(p_location,300);
    regions := public.oe_regions_in_text(regexp_replace(p_location,'remote|anywhere',' ','gi')); RETURN;
  END IF;
  IF coalesce(p_location,'') ~* c_ons THEN arrangement := 'onsite'; basis := 'location_field'; quote := left(p_location,300); RETURN; END IF;

  FOR v_sent IN SELECT trim(x) FROM regexp_split_to_table(coalesce(p_page,''), '[.!?•]\s+|\n+|\s{2,}') x LOOP
    CONTINUE WHEN length(v_sent) < 4;
    IF length(v_sent) < 90 AND v_sent ~* c_role_head THEN v_perk := false;
    ELSIF length(v_sent) < 120 AND v_sent ~* c_perk_head THEN v_perk := true;
    END IF;
    CONTINUE WHEN v_perk OR v_sent ~* c_perk;
    IF v_hyb IS NULL AND v_sent ~* c_hyb THEN v_hyb := v_sent;
    ELSIF v_rem IS NULL AND v_sent ~* c_rem THEN v_rem := v_sent;
    ELSIF v_ons IS NULL AND v_sent ~* c_ons THEN v_ons := v_sent;
    END IF;
  END LOOP;
  IF v_hyb IS NOT NULL THEN arrangement := 'hybrid'; quote := left(v_hyb,300);
  ELSIF v_rem IS NOT NULL THEN arrangement := 'remote'; quote := left(v_rem,300);
    regions := public.oe_regions_in_text(v_rem);
  ELSIF v_ons IS NOT NULL THEN arrangement := 'onsite'; quote := left(v_ons,300);
  END IF;
  IF arrangement <> 'unknown' THEN basis := 'role_text'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.oe_opportunity_remote_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record; v_struct jsonb;
BEGIN
  v_struct := NEW.raw->'structured';
  IF v_struct IS NULL AND NEW.candidate_id IS NOT NULL THEN
    SELECT c.raw->'structured' INTO v_struct FROM oe_candidates c WHERE c.id = NEW.candidate_id;
  END IF;
  SELECT * INTO r FROM public.oe_classify_work_arrangement(NEW.title, NEW.location, NEW.raw->>'page_text', v_struct);
  NEW.work_arrangement := r.arrangement;
  NEW.work_arrangement_basis := r.basis;
  NEW.work_arrangement_quote := r.quote;
  NEW.applicant_regions := coalesce(r.regions,'{}');
  NEW.remote := (r.arrangement = 'remote');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS oe_opportunity_remote_guard ON public.oe_opportunities;
CREATE TRIGGER oe_opportunity_remote_guard BEFORE INSERT OR UPDATE OF remote, raw, location, title, candidate_id
  ON public.oe_opportunities FOR EACH ROW EXECUTE FUNCTION public.oe_opportunity_remote_guard();

-- places_source follows whether he has ratified a place rule (countries_allowed is only filled from those).
CREATE OR REPLACE FUNCTION public.oe_eligibility_places_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.places_source := CASE WHEN coalesce(cardinality(NEW.countries_allowed),0) > 0 THEN 'member' ELSE 'default' END;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS oe_eligibility_places_source ON public.oe_eligibility;
CREATE TRIGGER oe_eligibility_places_source BEFORE INSERT OR UPDATE ON public.oe_eligibility
  FOR EACH ROW EXECUTE FUNCTION public.oe_eligibility_places_source();

-- A withdrawn card never returns as a card.
CREATE OR REPLACE FUNCTION public.oe_card_is_repeat(p_user uuid, p_opp uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with me as (select lower(trim(coalesce(title,''))) t, public.oe_norm_employer(coalesce(issuer_raw,'')) e from oe_opportunities where id=p_opp),
  hist as (
    select opportunity_id, created_at at from oe_cards where user_id=p_user and opportunity_id is not null and opportunity_id<>p_opp
    union all
    select opportunity_id, shown_at from oe_serves where user_id=p_user and opportunity_id is not null and opportunity_id<>p_opp)
  select exists (select 1 from oe_cards w where w.user_id=p_user and w.opportunity_id=p_opp and w.withdrawn_at is not null)
      or exists (
    select 1 from hist h join oe_opportunities o2 on o2.id=h.opportunity_id, me
    where h.at > now() - interval '30 days' and me.t <> ''
      and lower(trim(coalesce(o2.title,''))) = me.t
      and public.oe_norm_employer(coalesce(o2.issuer_raw,'')) = me.e);
$function$;

-- The member's view of how a role is worked, for the chip.
CREATE OR REPLACE FUNCTION public.oe_app_work_arrangement(p_ids uuid[])
RETURNS TABLE(id uuid, work_arrangement text, work_arrangement_basis text, work_arrangement_quote text, applicant_regions text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select o.id, o.work_arrangement, o.work_arrangement_basis, o.work_arrangement_quote, o.applicant_regions
  from oe_opportunities o
  where auth.uid() is not null and o.id = any(p_ids[1:200])
$$;

REVOKE EXECUTE ON FUNCTION public.oe_classify_work_arrangement(text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.oe_app_work_arrangement(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_app_work_arrangement(uuid[]) TO authenticated;
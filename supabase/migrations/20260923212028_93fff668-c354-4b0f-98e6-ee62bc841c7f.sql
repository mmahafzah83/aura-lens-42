ALTER TABLE public.oe_eligibility
  ADD COLUMN IF NOT EXISTS relocation_ok boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relocation_countries text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.oe_opportunities ADD COLUMN IF NOT EXISTS level_basis text;
ALTER TABLE public.oe_candidates ADD COLUMN IF NOT EXISTS country text;

-- Programme kind: tested on the title only, so "MBA preferred" in a job body never makes a job a programme.
INSERT INTO public.oe_opportunity_kinds (code, label_en, label_ar, detect_en, detect_ar, sort_order, location_sensitivity, level_gate_applies, allows_opportunity_language, required_fields)
VALUES ('programme','Programmes & learning','برامج وتعلّم',
 '\y(mba|emba|master''?s|bachelor''?s|degree|diploma|phd|doctoral|course|certificate programme|certificate program|bootcamp|residency|internship|intern\y|graduate (programme|program|scheme|trainee)|trainee programme|cohort|builders? (programme|program)|accelerator|incubator|student fellowship|fellowship for students|talent (pool|community|network)|general application|open application|speculative application|expression of interest to join)',
 '(ماجستير|بكالوريوس|دبلوم|دكتوراه|دورة|برنامج تدريبي|تدريب تعاوني|تدريب صيفي|متدرب|برنامج الخريجين|حديثي التخرج|مسرعة أعمال|حاضنة|قاعدة المواهب|طلب توظيف عام)',
 0,'none',false,true,'[]'::jsonb)
ON CONFLICT (code) DO UPDATE SET detect_en=EXCLUDED.detect_en, detect_ar=EXCLUDED.detect_ar, sort_order=0,
  location_sensitivity='none', level_gate_applies=false, label_en=EXCLUDED.label_en, label_ar=EXCLUDED.label_ar;

UPDATE public.oe_opportunity_kinds SET location_sensitivity='hard' WHERE code='executive_role';

CREATE OR REPLACE FUNCTION public.oe_classify_kind(o oe_opportunities)
 RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $function$
DECLARE v_text text; v_offer boolean; v_hiring boolean; k record; p record;
BEGIN
  IF o.access_state IN ('observed_event','possible_need') THEN RETURN 'market_signal'; END IF;

  -- Not a seat: a programme is read off the title alone.
  SELECT detect_en, detect_ar INTO p FROM public.oe_opportunity_kinds WHERE code='programme';
  IF FOUND AND (
       (NULLIF(p.detect_en,'') IS NOT NULL AND COALESCE(o.title,'') ~* p.detect_en)
    OR (NULLIF(p.detect_ar,'') IS NOT NULL AND COALESCE(o.title,'') ~ p.detect_ar)) THEN
    RETURN 'programme';
  END IF;

  v_text := left(concat_ws(' ',
    COALESCE(o.title,''), COALESCE(o.scope,''), COALESCE(o.evidence_quote,''),
    COALESCE(o.chair_type,''),
    COALESCE((o.raw - 'page_text' - 'html' - 'model')::text,'')), 20000);

  v_offer := v_text ~* '\y((media|ecosystem|knowledge|content|community) partner|sponsorship|partnership opportunit|partner with us|call for (speakers|papers|nominations|chapters|entries))';
  v_hiring := NOT v_offer AND (
    (o.route_kind = 'application' AND o.discovery_kind = 'posted_opening')
    OR o.deadline IS NOT NULL);

  FOR k IN SELECT code, detect_en, detect_ar, require_en, exclude_en, require_ar, exclude_ar
           FROM public.oe_opportunity_kinds WHERE code <> 'programme' ORDER BY sort_order, code LOOP
    CONTINUE WHEN v_hiring AND k.code IN (
      'investment_partnership','speaking_platform','professional_membership',
      'authoring_publication','award_judging','executive_teaching');
    IF (NULLIF(k.detect_en,'') IS NOT NULL AND v_text ~* k.detect_en)
       AND (NULLIF(k.require_en,'') IS NULL OR v_text ~* k.require_en OR v_hiring)
       AND (NULLIF(k.exclude_en,'') IS NULL OR v_text !~* k.exclude_en)
    THEN RETURN k.code; END IF;
    IF (NULLIF(k.detect_ar,'') IS NOT NULL AND v_text ~ k.detect_ar)
       AND (NULLIF(k.require_ar,'') IS NULL OR v_text ~ k.require_ar OR v_hiring)
       AND (NULLIF(k.exclude_ar,'') IS NULL OR v_text !~ k.exclude_ar)
       AND (NULLIF(k.exclude_en,'') IS NULL OR v_text !~* k.exclude_en)
    THEN RETURN k.code; END IF;
  END LOOP;
  RETURN 'market_signal';
END $function$;

-- Level from the whole posting, when the title says nothing.
CREATE OR REPLACE FUNCTION public.oe_level_from_text(p text)
 RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
DECLARE t text := left(COALESCE(p,''), 30000); y int; n int; m text[];
BEGIN
  IF t = '' THEN RETURN NULL; END IF;
  IF t ~* 'report(s|ing)? (directly )?(in)?to (the )?(group |deputy )?(ceo|chief executive|managing director|board|president|chairman)'
     OR t ~ '(يرفع|يتبع|يرتبط) (تقاريره |مباشرة )*(إلى |ب)?(الرئيس التنفيذي|مجلس الإدارة|العضو المنتدب)' THEN
    RETURN 'senior_director';
  END IF;
  m := regexp_match(t, '(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)', 'i');
  IF m IS NULL THEN m := regexp_match(t, '(\d{1,2})\s*\+?\s*(?:سنة|سنوات|عاما|عامًا)'); END IF;
  IF m IS NOT NULL THEN
    y := m[1]::int;
    IF y BETWEEN 1 AND 40 THEN
      RETURN CASE WHEN y >= 15 THEN 'director' WHEN y >= 10 THEN 'senior_manager' WHEN y >= 5 THEN 'manager' ELSE 'ic' END;
    END IF;
  END IF;
  m := regexp_match(t, '(?:team|department|function|organi[sz]ation) of (\d{1,4})', 'i');
  IF m IS NULL THEN m := regexp_match(t, '(?:lead|leads|leading|manage|manages|managing) (?:a team of |over )?(\d{1,4})\+? (?:people|staff|employees|professionals|direct reports)', 'i'); END IF;
  IF m IS NOT NULL THEN
    n := m[1]::int;
    RETURN CASE WHEN n >= 50 THEN 'director' WHEN n >= 10 THEN 'senior_manager' WHEN n >= 3 THEN 'manager' ELSE NULL END;
  END IF;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION public.oe_level_from_text(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.oe_fill_level()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  IF NEW.level_band IS NOT NULL THEN
    NEW.level_basis := COALESCE(NEW.level_basis, 'title');
  ELSE
    v := public.oe_level_from_text(concat_ws(' ', NEW.scope, NEW.raw->>'page_text'));
    IF v IS NOT NULL THEN NEW.level_band := v; NEW.level_basis := 'description'; END IF;
  END IF;
  RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.oe_fill_level() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_oe_fill_level ON public.oe_opportunities;
CREATE TRIGGER trg_oe_fill_level BEFORE INSERT ON public.oe_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.oe_fill_level();

-- Workable places for a member, one definition.
CREATE OR REPLACE FUNCTION public.oe_workable_places(e oe_eligibility)
 RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  select coalesce(array_agg(distinct upper(c)) filter (where c is not null and c <> ''), '{}'::text[])
  from unnest(coalesce(e.countries_allowed,'{}'::text[])
       || array[e.residence_country]::text[]
       || case when e.relocation_ok then coalesce(e.relocation_countries,'{}'::text[]) else '{}'::text[] end) c
$function$;

CREATE OR REPLACE FUNCTION public.oe_relocation_save(p_ok boolean, p_countries text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_c text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT coalesce(array_agg(distinct upper(x)), '{}') INTO v_c
    FROM unnest(coalesce(p_countries,'{}'::text[])) x WHERE x ~ '^[A-Za-z]{2}$';
  INSERT INTO oe_eligibility (user_id, relocation_ok, relocation_countries)
  VALUES (v_uid, COALESCE(p_ok,false), v_c)
  ON CONFLICT (user_id) DO UPDATE SET relocation_ok = EXCLUDED.relocation_ok, relocation_countries = EXCLUDED.relocation_countries;
  RETURN jsonb_build_object('ok', true, 'relocation_ok', COALESCE(p_ok,false), 'relocation_countries', v_c);
END $function$;
REVOKE ALL ON FUNCTION public.oe_relocation_save(boolean, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_relocation_save(boolean, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.oe_app_found(p_days integer DEFAULT 7)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
with me as (select auth.uid() uid),
el as (
  select coalesce(e.countries_allowed,'{}'::text[]) countries_allowed,
         e.residence_country,
         coalesce(e.remote_ok,false) remote_ok,
         case when e.user_id is null then '{}'::text[] else public.oe_workable_places(e) end workable,
         coalesce(e.kinds_preferred,'{}'::text[]) kinds_preferred,
         coalesce(e.org_types_preferred,'{}'::text[]) org_types_preferred,
         coalesce(e.issuers_followed,'{}'::uuid[]) issuers_followed,
         coalesce(e.issuers_hidden,'{}'::uuid[]) issuers_hidden,
         case e.level_floor when 'board' then 8 when 'c_suite' then 7 when 'vp' then 6
           when 'senior_director' then 5 when 'director' then 4 when 'senior_manager' then 3
           when 'manager' then 2 when 'ic' then 1 else 0 end floor_rank
  from me left join oe_eligibility e on e.user_id = me.uid
),
pref as (
  select coalesce(nullif(countries_allowed,'{}'::text[]), array[residence_country]::text[], '{}'::text[]) countries
  from el
),
base as (
  select o.id, o.title, coalesce(nullif(o.issuer_raw,''),'—') issuer, o.location, o.level_band, o.level_basis, o.kind,
         o.source_url, o.route_url, o.route_kind, o.deadline, o.first_seen_at, o.remote,
         coalesce(nullif(o.sector,''), ent.sector_code) sector,
         public.oe_country_of_place(o.location) country,
         ent.entity_kind org_type,
         (o.issuer_id is not null and o.issuer_id = any(el.issuers_followed)) followed,
         (o.kind = any(el.kinds_preferred)) kind_pref,
         (ent.entity_kind is not null and ent.entity_kind = any(el.org_types_preferred)) org_pref,
         exists(select 1 from oe_matches m where m.opportunity_id=o.id and m.user_id=me.uid) judged,
         (select max(m.judged_at) from oe_matches m where m.opportunity_id=o.id and m.user_id=me.uid) judged_at,
         (select max(c.card_date) from oe_cards c where c.opportunity_id=o.id and c.user_id=me.uid) card_date,
         case o.level_band when 'board' then 8 when 'c_suite' then 7 when 'vp' then 6 when 'senior_director' then 5
           when 'director' then 4 when 'senior_manager' then 3 when 'manager' then 2 when 'ic' then 1 else 0 end lvl,
         el.floor_rank, el.workable, el.remote_ok,
         case when public.oe_country_of_place(o.location) = any(pref.countries) then 2
              when public.oe_country_of_place(o.location) is null or o.remote is true then 1 else 0 end place_fit
  from oe_opportunities o
  cross join me cross join pref cross join el
  left join oe_entities ent on ent.id = o.issuer_id
  where me.uid is not null and o.alive is true
    and o.first_seen_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
    and (o.issuer_id is null or not (o.issuer_id = any(el.issuers_hidden)))
),
grouped as (
  select b.*,
    case
      when b.kind='programme' then 'programmes'
      when b.kind='executive_role' and b.country is not null and b.country <> 'OTHER' and cardinality(b.workable) > 0
           and not (b.country = any(b.workable)) and not (b.remote is true and b.remote_ok) then 'elsewhere'
      when b.kind='executive_role' and b.country = 'OTHER' and cardinality(b.workable) > 0
           and not (b.remote is true and b.remote_ok) then 'elsewhere'
      when b.kind='executive_role' and b.level_band is null then 'level_unstated'
      when b.kind='executive_role' and b.lvl >= greatest(b.floor_rank, 3) then 'at_level'
      when b.kind='executive_role' then 'below_level'
      when b.kind='market_signal' then 'signals'
      else 'mandates'
    end grp
  from base b
),
items as (
  select grp, count(*) n,
    jsonb_agg(jsonb_build_object('id',id,'title',title,'issuer',issuer,'location',location,'level',level_band,'level_basis',level_basis,
      'kind',kind,'source_url',source_url,'route_url',route_url,'route_kind',route_kind,'deadline',deadline,
      'first_seen_at',first_seen_at,'judged',judged,'judged_at',judged_at,'card_date',card_date,
      'place_fit',place_fit,'sector',sector,'country',country,'org_type',org_type,'followed',followed)
      order by followed desc, kind_pref desc, org_pref desc, lvl desc, place_fit desc, first_seen_at desc) list
  from grouped where grp <> 'signals' group by grp
),
signals as (
  select sum(k)::int n, jsonb_agg(jsonb_build_object('issuer',issuer,'openings',k,'sample',s) order by pf desc, k desc) list
  from (select issuer, count(*) k, max(place_fit) pf, (array_agg(title order by first_seen_at desc))[1:3] s
        from grouped where grp='signals' group by issuer) x
)
select jsonb_build_object(
  'days', p_days, 'from', (select min(first_seen_at) from grouped), 'to', (select max(first_seen_at) from grouped),
  'total', (select count(*) from grouped),
  'groups', jsonb_build_array(
    jsonb_build_object('key','at_level','label_en','Roles at your level','label_ar','أدوار بمستواك','count',coalesce((select n from items where grp='at_level'),0),'items',coalesce((select list from items where grp='at_level'),'[]')),
    jsonb_build_object('key','elsewhere','label_en','Elsewhere','label_ar','في أماكن أخرى','count',coalesce((select n from items where grp='elsewhere'),0),'items',coalesce((select list from items where grp='elsewhere'),'[]')),
    jsonb_build_object('key','mandates','label_en','Mandates, boards and stages','label_ar','تكليفات ومجالس ومنصّات','count',coalesce((select n from items where grp='mandates'),0),'items',coalesce((select list from items where grp='mandates'),'[]')),
    jsonb_build_object('key','level_unstated','label_en','Level not stated','label_ar','المستوى غير معلن','count',coalesce((select n from items where grp='level_unstated'),0),'items',coalesce((select list from items where grp='level_unstated'),'[]')),
    jsonb_build_object('key','signals','label_en','Who is hiring','label_ar','من يوظّف الآن','count',coalesce((select n from signals),0),'employers',coalesce((select list from signals),'[]')),
    jsonb_build_object('key','below_level','label_en','Below your level','label_ar','دون مستواك','count',coalesce((select n from items where grp='below_level'),0),'items',coalesce((select list from items where grp='below_level'),'[]')),
    jsonb_build_object('key','programmes','label_en','Programmes & learning','label_ar','برامج وتعلّم','count',coalesce((select n from items where grp='programmes'),0),'items',coalesce((select list from items where grp='programmes'),'[]'),'collapsed',true)
  ));
$function$;
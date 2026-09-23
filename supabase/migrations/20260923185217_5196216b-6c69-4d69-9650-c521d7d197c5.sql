-- Four more questions on the bar: opportunity type, level floor, employer type,
-- and the companies he follows or never wants to see. All of them rank; only the
-- hidden-company list removes anything, and he signs that one himself.

ALTER TABLE public.oe_eligibility
  ADD COLUMN IF NOT EXISTS kinds_preferred text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS org_types_preferred text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS issuers_followed uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS issuers_hidden uuid[] NOT NULL DEFAULT '{}';

-- A searchable picker over the organisations we already know.
CREATE OR REPLACE FUNCTION public.oe_ref_entity_search(p_q text)
RETURNS TABLE(id uuid, name text, sector_code text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT e.id, e.name, e.sector_code
  FROM oe_entities e
  WHERE auth.uid() IS NOT NULL
    AND coalesce(btrim(p_q),'') <> ''
    AND (e.name ILIKE '%' || btrim(p_q) || '%' OR coalesce(e.name_ar,'') ILIKE '%' || btrim(p_q) || '%')
  ORDER BY (lower(e.name) LIKE lower(btrim(p_q)) || '%') DESC, length(e.name), e.name
  LIMIT 20;
$$;
REVOKE ALL ON FUNCTION public.oe_ref_entity_search(text) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_ref_entity_search(text) TO authenticated;

-- 'issuer' becomes a saveable field. Follow and hide are two separate rules on
-- the same field, so only the rule with the same operator is replaced.
CREATE OR REPLACE FUNCTION public.oe_filter_save(p_field text, p_op text, p_values text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_hard boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_field NOT IN ('place','level','sector','kind','engagement','org_type','language','nationality','issuer')
    THEN RAISE EXCEPTION 'unknown filter'; END IF;
  IF p_op NOT IN ('allow','at_or_above','exclude','prefer') THEN RAISE EXCEPTION 'unknown operator'; END IF;

  DELETE FROM oe_notebook
   WHERE user_id = v_uid AND entry_kind = 'rule' AND origin = 'stated' AND field = p_field
     AND (p_field <> 'issuer' OR op = p_op);

  IF p_values IS NOT NULL AND array_length(p_values, 1) > 0 THEN
    v_hard := (p_op <> 'prefer');
    INSERT INTO oe_notebook (user_id, entry_kind, origin, status, active, kind, field, op,
                             value, "values", rule_text, stated_on, proposal_status, ratified_at)
    VALUES (v_uid, 'rule', 'stated', 'active', true, CASE WHEN v_hard THEN 'hard' ELSE 'soft' END,
            p_field, p_op, p_values[1], p_values,
            initcap(replace(p_field,'_',' ')) || ': ' || array_to_string(p_values, ', '),
            current_date, 'signed', now());
  END IF;

  PERFORM public.oe_rebuild_eligibility(v_uid);
  RETURN jsonb_build_object('ok', true);
END $function$;

CREATE OR REPLACE FUNCTION public.oe_rebuild_eligibility(p_user uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_places text[]; v_blocked text[]; v_never text[]; v_sectors text[];
  v_kinds text[]; v_orgs text[]; v_follow uuid[]; v_hide uuid[]; v_floor text;
  v_reasons jsonb; v_rules jsonb;
BEGIN
  SELECT array_agg(DISTINCT code) INTO v_places FROM (
    SELECT upper(x) AS code FROM oe_notebook n,
      LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
      WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
        AND n.ratified_at IS NOT NULL AND n.field = 'place' AND n.op IN ('require','allow') AND x IS NOT NULL
        AND x NOT ILIKE 'region:%'
    UNION
    SELECT c.iso2 FROM oe_notebook n,
      LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
      JOIN oe_ref_countries c ON upper(substr(x, 8)) = ANY(c.region_codes)
      WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
        AND n.ratified_at IS NOT NULL AND n.field = 'place' AND n.op IN ('require','allow')
        AND x ILIKE 'region:%' AND upper(substr(x, 8)) <> 'WORLD'
  ) s;
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

  -- The four new questions. Each ranks; none of them removes anything.
  SELECT array_agg(DISTINCT x) INTO v_kinds FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'kind' AND n.op IN ('prefer','allow','require') AND x IS NOT NULL;
  SELECT array_agg(DISTINCT x) INTO v_orgs FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'org_type' AND n.op IN ('prefer','allow','require') AND x IS NOT NULL;
  SELECT x INTO v_floor FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'level' AND n.op = 'at_or_above' AND x IS NOT NULL
    ORDER BY n.stated_on DESC LIMIT 1;
  SELECT array_agg(DISTINCT x::uuid) INTO v_follow FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'issuer' AND n.op = 'prefer'
      AND x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  SELECT array_agg(DISTINCT x::uuid) INTO v_hide FROM oe_notebook n,
    LATERAL unnest(COALESCE(NULLIF(n.values,'{}'), ARRAY[n.value])) x
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.status='active'
      AND n.ratified_at IS NOT NULL AND n.field = 'issuer' AND n.op = 'exclude'
      AND x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

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
                              level_ceiling, level_floor, sectors_core, blocked_reasons, stated_rules,
                              kinds_preferred, org_types_preferred, issuers_followed, issuers_hidden)
  VALUES (p_user, COALESCE(v_places, '{}'), COALESCE(v_blocked, '{}'), COALESCE(v_never, '{}'),
          NULL, v_floor, COALESCE(v_sectors, '{}'), COALESCE(v_reasons, '{}'::jsonb), v_rules,
          COALESCE(v_kinds,'{}'), COALESCE(v_orgs,'{}'), COALESCE(v_follow,'{}'), COALESCE(v_hide,'{}'))
  ON CONFLICT (user_id) DO UPDATE SET
    countries_allowed      = COALESCE(v_places, '{}'),
    chair_types_blocked    = COALESCE(v_blocked, '{}'),
    chair_types_never_held = COALESCE(v_never, '{}'),
    level_ceiling = NULL,
    level_floor            = v_floor,
    sectors_core           = COALESCE(v_sectors, '{}'),
    blocked_reasons        = COALESCE(v_reasons, '{}'::jsonb),
    stated_rules           = v_rules,
    kinds_preferred        = COALESCE(v_kinds,'{}'),
    org_types_preferred    = COALESCE(v_orgs,'{}'),
    issuers_followed       = COALESCE(v_follow,'{}'),
    issuers_hidden         = COALESCE(v_hide,'{}'),
    updated_at             = now();
END $function$;

-- The week's reading, now ranked by what he asked for and filterable on screen.
CREATE OR REPLACE FUNCTION public.oe_app_found(p_days integer DEFAULT 7)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
with me as (select auth.uid() uid),
el as (
  select coalesce(e.countries_allowed,'{}'::text[]) countries_allowed,
         e.residence_country,
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
  select o.id, o.title, coalesce(nullif(o.issuer_raw,''),'—') issuer, o.location, o.level_band, o.kind,
         o.source_url, o.route_url, o.route_kind, o.deadline, o.first_seen_at,
         coalesce(nullif(o.sector,''), ent.sector_code) sector,
         public.oe_country_of_place(o.location) country,
         ent.entity_kind org_type,
         (o.issuer_id is not null and o.issuer_id = any(el.issuers_followed)) followed,
         (o.kind = any(el.kinds_preferred)) kind_pref,
         (ent.entity_kind is not null and ent.entity_kind = any(el.org_types_preferred)) org_pref,
         exists(select 1 from oe_matches m where m.opportunity_id=o.id and m.user_id=me.uid) judged,
         case o.level_band when 'board' then 8 when 'c_suite' then 7 when 'vp' then 6 when 'senior_director' then 5
           when 'director' then 4 when 'senior_manager' then 3 when 'manager' then 2 when 'ic' then 1 else 0 end lvl,
         el.floor_rank,
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
    jsonb_agg(jsonb_build_object('id',id,'title',title,'issuer',issuer,'location',location,'level',level_band,
      'kind',kind,'source_url',source_url,'route_url',route_url,'route_kind',route_kind,'deadline',deadline,
      'first_seen_at',first_seen_at,'judged',judged,'place_fit',place_fit,
      'sector',sector,'country',country,'org_type',org_type,'followed',followed)
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
    jsonb_build_object('key','mandates','label_en','Mandates, boards and stages','label_ar','تكليفات ومجالس ومنصّات','count',coalesce((select n from items where grp='mandates'),0),'items',coalesce((select list from items where grp='mandates'),'[]')),
    jsonb_build_object('key','level_unstated','label_en','Roles with no stated level','label_ar','أدوار بلا مستوى معلن','count',coalesce((select n from items where grp='level_unstated'),0),'items',coalesce((select list from items where grp='level_unstated'),'[]')),
    jsonb_build_object('key','signals','label_en','Who is hiring','label_ar','من يوظّف الآن','count',coalesce((select n from signals),0),'employers',coalesce((select list from signals),'[]')),
    jsonb_build_object('key','below_level','label_en','Below your level','label_ar','دون مستواك','count',coalesce((select n from items where grp='below_level'),0),'items',coalesce((select list from items where grp='below_level'),'[]'))
  ));
$function$;
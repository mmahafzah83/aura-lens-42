-- Two more honest dates on every finding: when it was actually judged, and the
-- day it reached him as a card. The timeline needs real dates, not guesses.
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
         (select max(m.judged_at) from oe_matches m where m.opportunity_id=o.id and m.user_id=me.uid) judged_at,
         (select max(c.card_date) from oe_cards c where c.opportunity_id=o.id and c.user_id=me.uid) card_date,
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
    jsonb_build_object('key','mandates','label_en','Mandates, boards and stages','label_ar','تكليفات ومجالس ومنصّات','count',coalesce((select n from items where grp='mandates'),0),'items',coalesce((select list from items where grp='mandates'),'[]')),
    jsonb_build_object('key','level_unstated','label_en','Roles with no stated level','label_ar','أدوار بلا مستوى معلن','count',coalesce((select n from items where grp='level_unstated'),0),'items',coalesce((select list from items where grp='level_unstated'),'[]')),
    jsonb_build_object('key','signals','label_en','Who is hiring','label_ar','من يوظّف الآن','count',coalesce((select n from signals),0),'employers',coalesce((select list from signals),'[]')),
    jsonb_build_object('key','below_level','label_en','Below your level','label_ar','دون مستواك','count',coalesce((select n from items where grp='below_level'),0),'items',coalesce((select list from items where grp='below_level'),'[]'))
  ));
$function$;
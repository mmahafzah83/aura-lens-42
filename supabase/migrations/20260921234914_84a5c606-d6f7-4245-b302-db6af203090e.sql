-- A) The twelfth shape: a government body opens a draft rule for comment.
insert into public.oe_opportunity_kinds
  (code, label_en, label_ar, required_fields, detect_en, detect_ar,
   allows_opportunity_language, sort_order, location_sensitivity, level_gate_applies)
values (
  'public_consultation', 'Public consultation', 'استطلاع مرئيات',
  '["deadline","route_url"]'::jsonb,
  'consultation|draft regulation|public comment|call for comment',
  'استطلاع|مشروع نظام|مشروع لائحة|إبداء المرئيات|طلب مرئيات',
  true, 9, 'soft', false)
on conflict (code) do update set
  label_en = excluded.label_en,
  label_ar = excluded.label_ar,
  required_fields = excluded.required_fields,
  detect_en = excluded.detect_en,
  detect_ar = excluded.detect_ar,
  allows_opportunity_language = excluded.allows_opportunity_language,
  location_sensitivity = excluded.location_sensitivity,
  level_gate_applies = excluded.level_gate_applies,
  updated_at = now();

-- B) A board-nomination page is its own kind of surface.
alter table public.oe_surfaces drop constraint if exists oe_surfaces_surface_type_check;
alter table public.oe_surfaces add constraint oe_surfaces_surface_type_check
  check (surface_type = any (array['careers','news','press','insights','events','tenders',
    'leadership','investor_relations','blog','podcast','directory','board_nominations']));
alter table public.oe_surfaces drop constraint if exists oe_surfaces_harvest_kind_check;
alter table public.oe_surfaces add constraint oe_surfaces_harvest_kind_check
  check (harvest_kind = any (array['ats_api','rss','atom','sitemap','json_ld','json_api',
    'html_list','pdf_list','announcements']));

-- D) Distance demotes, never hides.
create or replace function public.oe_place_weight(
  p_user uuid, p_location text, p_sector text
) returns numeric
language sql stable security definer set search_path = public as $$
  select case
    when exists (
      select 1 from public.oe_ref_countries c
      where 'GCC' = any(c.region_codes)
        and lower(coalesce(p_location,'')) like '%'||lower(c.name_en)||'%'
    ) then 1.0
    when exists (
      select 1 from public.oe_notebook n
      where n.user_id = p_user and n.entry_kind='rule' and n.field='sector'
        and n.active and n.status='active' and n.ratified_at is not null
        and lower(coalesce(p_sector,'')) like '%'||replace(lower(n.value),'_','%')||'%'
    ) then 1.0
    else 0.5
  end;
$$;
revoke execute on function public.oe_place_weight(uuid, text, text) from anon, authenticated;

-- E) Sectors are a denominator.
update public.oe_entities e set sector_code = m.code
from (values
  ('government agency','government'),('ministry','government'),('political party','government'),
  ('nonprofit','nonprofit_international'),('ngo','nonprofit_international'),
  ('association','nonprofit_international'),('international organization','nonprofit_international'),
  ('publisher','media'),('newspaper','media'),('media company','media'),('business media','media'),
  ('consulting media','media'),('financial media','media'),('startup media','media'),
  ('projects and business media','media'),
  ('hospital','health'),('health','health'),('medical organization','health'),
  ('school','education'),('university','education'),('education','education'),('college','education'),
  ('educational organization','education'),('research institute','education'),
  ('airline','logistics_transport'),
  ('management consulting','consulting_professional'),('consulting','consulting_professional'),
  ('professional services','consulting_professional'),('technology consulting','consulting_professional'),
  ('restructuring consulting','consulting_professional'),('economic consulting','consulting_professional'),
  ('cybersecurity consulting','consulting_professional'),('advisory','consulting_professional'),
  ('software company','technology'),('digital services','technology'),
  ('bank','finance_banking'),('retail chain','retail_consumer')
) as m(industry, code)
where lower(trim(e.industry)) = m.industry and e.sector_code is null;

-- The employer ladder carries the sector of the organisations its pattern names.
update public.oe_employer_ladder l
set sector_code = (
  select e.sector_code from public.oe_entities e
  where e.sector_code is not null and e.name ~* l.pattern
  group by e.sector_code order by count(*) desc limit 1
)
where l.sector_code is null and nullif(trim(l.pattern),'') is not null;
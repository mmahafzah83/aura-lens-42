CREATE OR REPLACE FUNCTION public.oe_default_places(p_residence text)
RETURNS text[] LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  with home as (select upper(coalesce(p_residence,'')) iso),
  reg as (
    select r as code from oe_ref_countries c, home, unnest(c.region_codes) with ordinality u(r, ord)
    where c.iso2 = home.iso and r <> 'WORLD' order by ord limit 1
  )
  select coalesce(array_agg(distinct x) filter (where x <> ''), '{}'::text[]) from (
    select iso as x from home
    union all
    select upper(c.iso2) from oe_ref_countries c, reg where reg.code = any(c.region_codes)
  ) s
$$;

CREATE OR REPLACE FUNCTION public.oe_workable_places(e oe_eligibility)
RETURNS text[] LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  select coalesce(array_agg(distinct upper(c)) filter (where c is not null and c <> ''), '{}'::text[])
  from unnest(
       case when coalesce(array_length(e.countries_allowed,1),0) = 0
            then public.oe_default_places(e.residence_country)
            else e.countries_allowed end
       || array[e.residence_country]::text[]
       || case when e.relocation_ok then coalesce(e.relocation_countries,'{}'::text[]) else '{}'::text[] end) c
$$;

GRANT EXECUTE ON FUNCTION public.oe_default_places(text) TO authenticated, service_role;

UPDATE public.oe_opportunity_kinds
SET detect_en = replace(detect_en, 'general application|', 'general (job )?application|join our talent|')
WHERE code = 'programme' AND detect_en NOT LIKE '%join our talent%';

-- 1) Screening batch: never-screened first, executive roles first, fresh first.
create or replace function public.oe_screen_batch(p_user uuid, p_limit int default 20)
returns table(opportunity_id uuid) language sql stable security definer set search_path=public as $$
  select m.opportunity_id
  from oe_matches m join oe_opportunities o on o.id = m.opportunity_id and o.alive
  where m.user_id = p_user
  order by (m.screened_at is null) desc,
           (o.kind = 'executive_role') desc,
           o.first_seen_at desc nulls last,
           m.screened_at asc nulls first
  limit greatest(1, least(p_limit, 100));
$$;
revoke all on function public.oe_screen_batch(uuid,int) from public, anon, authenticated;
grant execute on function public.oe_screen_batch(uuid,int) to service_role;

create or replace function public.oe_unscreened_members()
returns table(user_id uuid, unscreened bigint) language sql stable security definer set search_path=public as $$
  select m.user_id, count(*) from oe_matches m join oe_opportunities o on o.id=m.opportunity_id and o.alive
  where m.screened_at is null group by m.user_id;
$$;
revoke all on function public.oe_unscreened_members() from public, anon, authenticated;
grant execute on function public.oe_unscreened_members() to service_role;

-- 2) Computed read cap, recorded once per rolling day in oe_runs.
create or replace function public.oe_read_cap_today()
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; n int; spend numeric; cost7 numeric; reads7 int; cpr numeric; base_cap int; cap int;
begin
  select counts into r from oe_runs where run_kind='read_cap' and started_at > now()-interval '24 hours'
    order by started_at desc limit 1;
  if r is not null then return r; end if;
  select count(distinct c.user_id) into n from oe_consents c
    where c.kind='matching' and c.revoked_at is null
      and c.user_id not in (select user_id from excluded_user_ids());
  select coalesce((params->>'daily_spend_cap_usd')::numeric, 0) into spend from oe_policy_versions where active limit 1;
  select coalesce(sum(est_cost_usd),0) into cost7 from ai_usage_log
    where function_name in ('oe-fetch-feed','oe-extract-scope') and created_at > now()-interval '7 days';
  select count(*) into reads7 from oe_candidates where triage_state='read' and updated_at > now()-interval '7 days';
  cpr := case when reads7 > 0 and cost7 > 0 then cost7/reads7 else null end;
  base_cap := 150 + 20*coalesce(n,0);
  cap := case when cpr is not null and spend > 0 then least(base_cap, floor(spend/cpr)::int) else base_cap end;
  cap := greatest(cap, 1);
  r := jsonb_build_object('read_cap', cap, 'base', 150, 'per_member', 20, 'active_members', coalesce(n,0),
        'formula_cap', base_cap, 'daily_spend_cap_usd', spend, 'cost_7d_usd', round(cost7,4),
        'reads_7d', reads7, 'cost_per_read_usd', round(cpr,6),
        'spend_bound_cap', case when cpr is not null and spend>0 then floor(spend/cpr)::int end);
  insert into oe_runs(run_kind, started_at, finished_at, outcome, severity, counts)
    values ('read_cap', now(), now(), 'ok', 'info', r);
  return r;
end $$;
revoke all on function public.oe_read_cap_today() from public, anon, authenticated;
grant execute on function public.oe_read_cap_today() to service_role;

-- 3) Quarantine of junk sources.
alter table public.oe_feeds add column if not exists quarantined_at timestamptz, add column if not exists quarantine_reason text;
alter table public.oe_entities add column if not exists quarantined_at timestamptz, add column if not exists quarantine_reason text;

create or replace function public.oe_quarantine_junk()
returns jsonb language plpgsql security definer set search_path=public as $$
declare nf int := 0; ne int := 0;
begin
  with runs as (
    select feed_id src, date_trunc('hour', first_seen_at) run, count(*) total,
      count(*) filter (where triage_state='junior_title' or rejected_reason in
        ('junior_title','outside_our_geography','aggregator_or_index_page','too_thin','goods_or_works_procurement')) junk
    from oe_candidates where feed_id is not null group by 1,2),
  ranked as (select *, row_number() over (partition by src order by run desc) rn from runs),
  agg as (select src, sum(total) total, sum(junk) junk, count(*) nruns from ranked where rn<=3 group by src)
  update oe_feeds f set active=false, quarantined_at=now(),
    quarantine_reason = format('%s of %s candidates in the last 3 runs were junk (junior, outside geography or not a job)', a.junk, a.total)
  from agg a where a.src=f.id and a.nruns=3 and a.total>=10 and a.junk::numeric/a.total > 0.8
    and f.quarantined_at is null and f.active;
  get diagnostics nf = row_count;

  with runs as (
    select entity_id src, date_trunc('hour', first_seen_at) run, count(*) total,
      count(*) filter (where triage_state='junior_title' or rejected_reason in
        ('junior_title','outside_our_geography','aggregator_or_index_page','too_thin','goods_or_works_procurement')) junk
    from oe_candidates where entity_id is not null group by 1,2),
  ranked as (select *, row_number() over (partition by src order by run desc) rn from runs),
  agg as (select src, sum(total) total, sum(junk) junk, count(*) nruns from ranked where rn<=3 group by src)
  update oe_entities e set quarantined_at=now(),
    quarantine_reason = format('%s of %s candidates in the last 3 runs were junk (junior, outside geography or not a job)', a.junk, a.total)
  from agg a where a.src=e.id and a.nruns=3 and a.total>=10 and a.junk::numeric/a.total > 0.8
    and e.quarantined_at is null;
  get diagnostics ne = row_count;

  insert into oe_runs(run_kind, started_at, finished_at, outcome, severity, counts)
    values ('quarantine', now(), now(), 'ok', 'info', jsonb_build_object('feeds', nf, 'entities', ne));
  return jsonb_build_object('feeds', nf, 'entities', ne);
end $$;
revoke all on function public.oe_quarantine_junk() from public, anon, authenticated;
grant execute on function public.oe_quarantine_junk() to service_role;

create or replace function public.oe_restore_source(p_kind text, p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'admin only'; end if;
  if p_kind = 'feed' then
    update oe_feeds set quarantined_at=null, quarantine_reason=null,
      active = (terms_ok and access_finding is not null) where id=p_id;
  elsif p_kind = 'entity' then
    update oe_entities set quarantined_at=null, quarantine_reason=null where id=p_id;
  else raise exception 'kind must be feed or entity'; end if;
  insert into admin_action_log(admin_id, action, target_id, details)
    values (auth.uid(), 'oe_restore_source', p_id::text, jsonb_build_object('kind', p_kind));
exception when undefined_column then null;
end $$;
revoke all on function public.oe_restore_source(text,uuid) from public, anon;
grant execute on function public.oe_restore_source(text,uuid) to authenticated, service_role;

-- 4) Harvest order driven by member demand.
create or replace function public.oe_harvest_order(p_limit int, p_json_ld boolean default true)
returns table(id uuid) language sql stable security definer set search_path=public as $$
  with dc as (select upper(value) v, demand from oe_demand_map where dimension='country'),
       ds as (select value v, demand from oe_demand_map where dimension='sector')
  select e.id from oe_entities e
  left join dc on dc.v = upper(e.country)
  left join ds on ds.v = e.sector_code
  where e.quarantined_at is null
    and ((e.resolve_status='resolved' and e.ats_platform is not null)
      or (p_json_ld and e.resolve_status='no_ats' and e.careers_url is not null))
  order by (e.last_harvested_at is null or e.last_harvested_at < now() - case e.harvest_cadence
              when 'weekly' then interval '6 days' when 'monthly' then interval '27 days' else interval '20 hours' end) desc,
           (coalesce(dc.demand,0) + coalesce(ds.demand,0)) desc,
           (e.watch_tier = 'core') desc,
           (e.ats_platform is not null) desc,
           e.last_harvested_at asc nulls first
  limit greatest(1, p_limit);
$$;
revoke all on function public.oe_harvest_order(int,boolean) from public, anon, authenticated;
grant execute on function public.oe_harvest_order(int,boolean) to service_role;

create or replace function public.oe_read_cap_today()
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; n int; spend numeric; cost7 numeric; reads7 int; cpr numeric; base_cap int; cap int;
begin
  select counts into r from oe_runs where run_kind='read_cap' and started_at > now()-interval '24 hours'
    order by started_at desc limit 1;
  if r is not null then return r; end if;
  -- An active member is one with live matching consent: consent is what the engine works for.
  select count(distinct c.user_id) into n from oe_consents c
    where c.kind='matching' and c.revoked_at is null;
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
delete from oe_runs where run_kind='read_cap' and started_at > now()-interval '1 hour';
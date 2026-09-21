
-- ── 8) The goal must be read ───────────────────────────────────────────────
create or replace function public.oe_goal_weight(p_user uuid, p_kind text)
returns numeric
language sql stable security definer set search_path = public as $$
  with w as (
    select params->'goal_kind_weights' as m
    from oe_policy_versions where active order by created_at desc limit 1
  ),
  d as (
    select goal, coalesce(goal_secondary, '{}'::text[]) as sec
    from oe_direction where user_id = p_user
  ),
  primary_w as (
    select coalesce(((select m from w) -> (select goal from d) ->> p_kind)::numeric, 1.0) as v
  ),
  secondary_w as (
    select coalesce(max(1 + (coalesce(((select m from w) -> s ->> p_kind)::numeric, 1.0) - 1) / 2), 1.0) as v
    from (select unnest(sec) as s from d) t
  )
  -- Weights demote, never hide: the floor keeps every kind reachable.
  select greatest(0.25, greatest((select v from primary_w), (select v from secondary_w)));
$$;
revoke execute on function public.oe_goal_weight(uuid, text) from anon;

-- ── 14) the date we last checked the route ────────────────────────────────
alter table public.oe_opportunities add column if not exists route_checked_at timestamptz;
update public.oe_opportunities set route_checked_at = last_seen_at
 where route_checked_at is null and route_dead is not null;

-- ── 11) Lineage ───────────────────────────────────────────────────────────
alter table public.oe_opportunities add column if not exists candidate_id uuid;
alter table public.oe_opportunities add column if not exists lineage_note text;
update public.oe_opportunities o
   set candidate_id = c.id
  from oe_candidates c
 where o.candidate_id is null
   and o.raw->>'candidate_id' ~* '^[0-9a-f-]{36}$'
   and c.id = (o.raw->>'candidate_id')::uuid;
update public.oe_opportunities set lineage_note = 'pre_lineage'
 where candidate_id is null and lineage_note is null;
alter table public.oe_opportunities
  drop constraint if exists oe_opportunities_candidate_id_fkey;
alter table public.oe_opportunities
  add constraint oe_opportunities_candidate_id_fkey
  foreign key (candidate_id) references public.oe_candidates(id) on delete restrict;

-- ── 10) Read backlog ──────────────────────────────────────────────────────
create or replace view public.oe_read_backlog as
select c.id as candidate_id, c.feed_id, c.url, c.title, c.created_at, c.lang
from oe_candidates c
where c.triage_state = 'passed'
  and c.created_at < now() - interval '48 hours'
  and not exists (
    select 1 from oe_opportunities o where o.candidate_id = c.id or o.raw->>'candidate_id' = c.id::text
  );
alter view public.oe_read_backlog set (security_invoker = on);

update public.oe_serves s set card_id = null
 where s.card_id is not null and not exists (select 1 from oe_cards c where c.id = s.card_id);
alter table public.oe_serves drop constraint if exists oe_serves_card_id_fkey;
alter table public.oe_serves
  add constraint oe_serves_card_id_fkey
  foreign key (card_id) references public.oe_cards(id) on delete restrict;

alter table public.oe_feeds add column if not exists surface_id uuid;
with host_map as (
  select f.id as feed_id,
         min(s.id::text)::uuid as surface_id,
         count(distinct s.id) as n
  from oe_feeds f
  join oe_surfaces s
    on lower(regexp_replace(split_part(split_part(f.url, '://', 2), '/', 1), '^www\.', ''))
     = lower(regexp_replace(split_part(split_part(s.url, '://', 2), '/', 1), '^www\.', ''))
  where f.url is not null and s.url is not null
  group by f.id
)
update public.oe_feeds f set surface_id = h.surface_id
from host_map h where h.feed_id = f.id and h.n = 1 and f.surface_id is null;
alter table public.oe_feeds drop constraint if exists oe_feeds_surface_id_fkey;
alter table public.oe_feeds
  add constraint oe_feeds_surface_id_fkey
  foreign key (surface_id) references public.oe_surfaces(id) on delete restrict;

-- Cards and matches no longer vanish silently with their record.
alter table public.oe_cards drop constraint if exists oe_cards_opportunity_id_fkey;
alter table public.oe_cards add constraint oe_cards_opportunity_id_fkey
  foreign key (opportunity_id) references public.oe_opportunities(id) on delete restrict;
alter table public.oe_matches drop constraint if exists oe_matches_opportunity_id_fkey;
alter table public.oe_matches add constraint oe_matches_opportunity_id_fkey
  foreign key (opportunity_id) references public.oe_opportunities(id) on delete restrict;

create or replace view public.oe_lineage_orphans as
select 'serve_without_card'::text as kind, s.id as row_id, s.user_id, s.opportunity_id
  from oe_serves s
 where s.card_id is not null and not exists (select 1 from oe_cards c where c.id = s.card_id)
union all
select 'card_without_opportunity', c.id, c.user_id, c.opportunity_id
  from oe_cards c
 where c.opportunity_id is not null
   and not exists (select 1 from oe_opportunities o where o.id = c.opportunity_id)
union all
select 'match_without_opportunity', m.id, m.user_id, m.opportunity_id
  from oe_matches m
 where not exists (select 1 from oe_opportunities o where o.id = m.opportunity_id);
alter view public.oe_lineage_orphans set (security_invoker = on);

-- ── 12) Observability ─────────────────────────────────────────────────────
alter table public.oe_runs add column if not exists severity text;
alter table public.oe_runs drop constraint if exists oe_runs_severity_check;
alter table public.oe_runs add constraint oe_runs_severity_check
  check (severity is null or severity in ('info','warn','error'));
update public.oe_runs set severity = case when outcome = 'error' then 'error' else 'info' end
 where severity is null;

create table if not exists public.oe_run_schedule (
  run_kind text primary key,
  expected_every_hours numeric not null,
  created_at timestamptz not null default now()
);
grant select on public.oe_run_schedule to authenticated;
grant all on public.oe_run_schedule to service_role;
alter table public.oe_run_schedule enable row level security;
drop policy if exists "oe_run_schedule readable by admins" on public.oe_run_schedule;
create policy "oe_run_schedule readable by admins" on public.oe_run_schedule
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

insert into public.oe_run_schedule(run_kind, expected_every_hours) values
  ('enqueue_feeds', 24), ('worker', 1), ('invariants_check', 24),
  ('reverify_quote', 24), ('truth_verify', 24), ('judge_member', 24),
  ('screen_member', 24), ('enqueue_judging', 24), ('rls_probe', 24)
on conflict (run_kind) do nothing;

create or replace view public.oe_heartbeat as
select s.run_kind,
       max(r.started_at) as last_run_at,
       round(extract(epoch from (now() - max(r.started_at))) / 3600.0, 2) as hours_since,
       s.expected_every_hours,
       (max(r.started_at) is null
        or now() - max(r.started_at) > make_interval(hours => (2 * s.expected_every_hours)::int)) as stale
from oe_run_schedule s
left join oe_runs r on r.run_kind = s.run_kind
group by s.run_kind, s.expected_every_hours;
alter view public.oe_heartbeat set (security_invoker = on);

create or replace view public.oe_job_health as
select 'job_dead'::text as kind, j.id::text as row_id, j.job_type as detail, j.updated_at as at
  from job_queue j where j.status = 'dead' and j.updated_at > now() - interval '7 days'
union all
select 'http_timeout', r.id::text, coalesce(r.error_msg, 'no response'), r.created
  from net._http_response r
 where r.created > now() - interval '24 hours'
   and (r.status_code is null or r.status_code >= 500 or r.error_msg is not null);

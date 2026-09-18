-- Step 11: the source factory. The unit becomes an organisation, not a website.

create table if not exists public.oe_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_ar text,
  domain text,
  country text default 'SA',
  industry text,
  sub_industry text,
  entity_kind text check (entity_kind in ('listed','private','government','giga_project','university','regulator','ngo','other')),
  listed_symbol text,
  size_hint text,
  seed_source text not null,
  careers_url text,
  ats_platform text,
  ats_token text,
  ats_endpoint text,
  newsroom_url text,
  resolve_status text not null default 'new'
    check (resolve_status in ('new','resolved','no_careers','no_ats','failed')),
  resolve_error text,
  last_resolved_at timestamptz,
  harvest_cadence text not null default 'weekly',
  last_harvested_at timestamptz,
  last_job_count integer,
  harvest_runs integer not null default 0,
  changed_runs integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists oe_entities_name_country_uniq
  on public.oe_entities (lower(name), country);
create unique index if not exists oe_entities_domain_uniq
  on public.oe_entities (lower(domain)) where domain is not null;
create index if not exists oe_entities_resolve_status_idx on public.oe_entities (resolve_status);
create index if not exists oe_entities_ats_platform_idx on public.oe_entities (ats_platform);
create index if not exists oe_entities_industry_idx on public.oe_entities (industry);
create index if not exists oe_entities_harvest_idx
  on public.oe_entities (ats_platform, last_harvested_at nulls first)
  where ats_platform is not null;

grant all on public.oe_entities to service_role;

alter table public.oe_entities enable row level security;
create policy "oe_entities admin read"
  on public.oe_entities for select to authenticated
  using (public.is_current_user_admin());

drop trigger if exists oe_entities_touch on public.oe_entities;
create trigger oe_entities_touch before update on public.oe_entities
  for each row execute function public.update_updated_at_column();

alter table public.oe_candidates
  add column if not exists entity_id uuid references public.oe_entities(id) on delete set null;
create index if not exists oe_candidates_entity_idx on public.oe_candidates (entity_id);

create unique index if not exists job_queue_oe_resolve_entity_live_idx
  on public.job_queue (job_type)
  where job_type = 'oe_resolve_entity' and status in ('pending','claimed');
create unique index if not exists job_queue_oe_harvest_ats_live_idx
  on public.job_queue (job_type)
  where job_type = 'oe_harvest_ats' and status in ('pending','claimed');

alter table public.oe_feeds drop constraint if exists oe_feeds_kind_check;
alter table public.oe_feeds add constraint oe_feeds_kind_check check (kind in (
  'listing','rss','atom','sitemap','calendar','telegram','api','json_api',
  'html_list','embedded_json','member_forward','manual','ats','jsonld'
));
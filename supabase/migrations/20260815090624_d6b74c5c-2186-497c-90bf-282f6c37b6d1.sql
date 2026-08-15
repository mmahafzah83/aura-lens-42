create table if not exists public.mirror_reads (
  handle text primary key,
  canonical_url text not null,
  read jsonb not null,
  sparse boolean not null default false,
  generated_at timestamptz not null default now(),
  hit_count integer not null default 1
);

create table if not exists public.mirror_requests (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  handle text,
  email text,
  created_at timestamptz not null default now()
);
create index if not exists mirror_requests_ip_time on public.mirror_requests (ip_hash, created_at desc);

grant all on public.mirror_reads to service_role;
grant all on public.mirror_requests to service_role;

alter table public.mirror_reads enable row level security;
alter table public.mirror_requests enable row level security;
-- No public policies: only the service role touches these.
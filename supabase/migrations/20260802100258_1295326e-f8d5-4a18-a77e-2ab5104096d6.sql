create table public.deck_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id text,
  signal_id uuid,
  event text not null check (event in ('generated','validation_failed','rendered','exported','export_failed','published','abandoned')),
  lang text,
  theme text,
  length int,
  fit_steps int,
  invariant_failures text[],
  duration_ms int,
  created_at timestamptz not null default now()
);

grant select, insert on public.deck_events to authenticated;
grant all on public.deck_events to service_role;

alter table public.deck_events enable row level security;

create policy "Members can view their own deck events"
  on public.deck_events for select to authenticated
  using (user_id = auth.uid());

create policy "Members can insert their own deck events"
  on public.deck_events for insert to authenticated
  with check (user_id = auth.uid());

create index deck_events_user_created_idx on public.deck_events (user_id, created_at desc);
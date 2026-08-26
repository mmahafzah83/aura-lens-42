create table public.capability_responses (
  id                 uuid        not null default gen_random_uuid(),
  user_id            uuid        not null,
  dimension_id       uuid        not null,
  level              smallint    not null,
  instrument_version smallint    not null default 2,
  answered_at        timestamptz not null default now(),
  constraint capability_responses_pkey primary key (id),
  constraint capability_responses_user_id_dimension_id_key unique (user_id, dimension_id),
  constraint capability_responses_level_check check (level >= 1 and level <= 3),
  constraint capability_responses_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade,
  constraint capability_responses_dimension_id_fkey foreign key (dimension_id)
    references public.capability_dimensions(id) on delete cascade
);

create index idx_capability_responses_user
  on public.capability_responses (user_id, answered_at desc);

grant select, insert, update, delete on public.capability_responses to authenticated;
grant all on public.capability_responses to service_role;

alter table public.capability_responses enable row level security;

create policy "Users can view own capability responses"
  on public.capability_responses for select to authenticated
  using (auth.uid() = user_id);
create policy "Users can insert their own capability responses"
  on public.capability_responses for insert to authenticated
  with check (auth.uid() = user_id);
create policy "Users can update their own capability responses"
  on public.capability_responses for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own capability responses"
  on public.capability_responses for delete to authenticated
  using (auth.uid() = user_id);
create policy "cr_admin"
  on public.capability_responses for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

create table public.capability_radar_snapshots (
  id                 uuid           not null default gen_random_uuid(),
  user_id            uuid           not null,
  band               seniority_band not null,
  instrument_version smallint       not null default 2,
  levels             jsonb          not null default '{}'::jsonb,
  taken_at           timestamptz    not null default now(),
  constraint capability_radar_snapshots_pkey primary key (id),
  constraint capability_radar_snapshots_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade
);

create index idx_capability_radar_snapshots_user
  on public.capability_radar_snapshots (user_id, taken_at desc);

grant select, insert, update, delete on public.capability_radar_snapshots to authenticated;
grant all on public.capability_radar_snapshots to service_role;

alter table public.capability_radar_snapshots enable row level security;

create policy "Users can view own radar snapshots"
  on public.capability_radar_snapshots for select to authenticated
  using (auth.uid() = user_id);
create policy "Users can insert their own radar snapshots"
  on public.capability_radar_snapshots for insert to authenticated
  with check (auth.uid() = user_id);
create policy "crs_admin"
  on public.capability_radar_snapshots for all to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));
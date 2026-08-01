create table public.home_address (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address_date date not null,
  lens text not null check (lens in ('record','room','shape')),
  lens_reason text not null,
  address_md text not null,
  moves jsonb not null default '[]'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  model text,
  generated_at timestamptz not null default now(),
  unique (user_id, address_date)
);

grant select on public.home_address to authenticated;

create index home_address_user_date_idx on public.home_address (user_id, address_date desc);

alter table public.home_address enable row level security;

create policy "own address readable" on public.home_address
  for select using (auth.uid() = user_id);
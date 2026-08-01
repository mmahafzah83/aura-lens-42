create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  topic text not null,
  message text not null,
  ip_hash text,
  delivered boolean not null default false,
  created_at timestamptz not null default now()
);
create index contact_messages_email_created_idx on public.contact_messages (email, created_at desc);
create index contact_messages_created_idx on public.contact_messages (created_at desc);
alter table public.contact_messages enable row level security;
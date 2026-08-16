CREATE TABLE IF NOT EXISTS public.instrument_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'assessment',
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS instrument_runs_user_idx ON public.instrument_runs(user_id);
CREATE INDEX IF NOT EXISTS instrument_runs_created_idx ON public.instrument_runs(created_at);
GRANT SELECT ON public.instrument_runs TO authenticated;
GRANT ALL ON public.instrument_runs TO service_role;
ALTER TABLE public.instrument_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs readable" ON public.instrument_runs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  email_hash text,
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS signup_attempts_ip_idx ON public.signup_attempts(ip_hash, created_at);
GRANT ALL ON public.signup_attempts TO service_role;
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;
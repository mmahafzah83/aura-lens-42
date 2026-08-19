CREATE TABLE IF NOT EXISTS public.signup_refusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signup_refusals_ip_idx ON public.signup_refusals(ip_hash, created_at);
GRANT ALL ON public.signup_refusals TO service_role;
ALTER TABLE public.signup_refusals ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.signup_ceiling_alerts (
  ip_hash text PRIMARY KEY,
  last_sent_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.signup_ceiling_alerts TO service_role;
ALTER TABLE public.signup_ceiling_alerts ENABLE ROW LEVEL SECURITY;
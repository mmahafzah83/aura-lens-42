CREATE TABLE IF NOT EXISTS public.external_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount_usd numeric NOT NULL DEFAULT 0,
  cycle text NOT NULL DEFAULT 'monthly',
  renews_on date,
  status text NOT NULL DEFAULT 'active',
  notes text,
  last_verified date DEFAULT current_date,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_costs TO authenticated;
GRANT ALL ON public.external_costs TO service_role;

ALTER TABLE public.external_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage external costs" ON public.external_costs
  FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

INSERT INTO public.external_costs (name, amount_usd, cycle, renews_on, notes)
VALUES ('Firecrawl (Hobby)', 19.00, 'monthly', '2026-08-18', 'Stripe/Visa. Confirm it is actually used before renewal.');

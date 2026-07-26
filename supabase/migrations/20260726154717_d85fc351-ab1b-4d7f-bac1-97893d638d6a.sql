CREATE TABLE public.metric_targets (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null,
  target_value numeric not null,
  target_by date not null,
  baseline_value numeric,
  baseline_on date,
  rationale text not null,
  status text not null default 'active',
  reviewed_on date,
  review_note text,
  set_on date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  constraint metric_targets_status_ck check (status in ('active','kept','revised','dropped'))
);

CREATE INDEX metric_targets_metric_idx ON public.metric_targets (metric_key, status, set_on desc);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_targets TO authenticated;
GRANT ALL ON public.metric_targets TO service_role;

ALTER TABLE public.metric_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read targets" ON public.metric_targets FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY "Admins write targets" ON public.metric_targets FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admins update targets" ON public.metric_targets FOR UPDATE TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admins delete targets" ON public.metric_targets FOR DELETE TO authenticated USING (public.is_current_user_admin());
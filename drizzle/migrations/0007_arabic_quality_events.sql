CREATE TABLE public.arabic_quality_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  rule_id text NOT NULL,
  fixed boolean NOT NULL DEFAULT false
);
GRANT SELECT ON public.arabic_quality_events TO authenticated;
GRANT ALL ON public.arabic_quality_events TO service_role;
ALTER TABLE public.arabic_quality_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read arabic quality events" ON public.arabic_quality_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX arabic_quality_events_created_idx ON public.arabic_quality_events (created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_arabic_quality_7d()
RETURNS TABLE(rule_id text, fired integer, fixed_share numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.rule_id, count(*)::int, round(avg(CASE WHEN e.fixed THEN 1 ELSE 0 END)::numeric, 2)
  FROM public.arabic_quality_events e
  WHERE public.has_role(auth.uid(), 'admin') AND e.created_at > now() - interval '7 days'
  GROUP BY e.rule_id ORDER BY count(*) DESC
$$;
REVOKE ALL ON FUNCTION public.admin_arabic_quality_7d() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_arabic_quality_7d() TO authenticated;
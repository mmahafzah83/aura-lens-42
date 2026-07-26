CREATE TABLE public.decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decided_on date NOT NULL DEFAULT (now()::date),
  title text NOT NULL,
  decision text NOT NULL,
  rationale text,
  expected_outcome text,
  metric_key text,
  baseline_value numeric,
  expected_value numeric,
  review_on date,
  status text NOT NULL DEFAULT 'pending',
  actual_value numeric,
  reviewed_on date,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decisions_status_valid
    CHECK (status IN ('pending','open','confirmed','refuted','inconclusive')),
  -- A decision in flight must be capable of being proven wrong.
  CONSTRAINT decisions_open_is_falsifiable CHECK (
    status <> 'open'
    OR (review_on IS NOT NULL AND metric_key IS NOT NULL
        AND (metric_key = 'none' OR expected_value IS NOT NULL))
  )
);

GRANT SELECT, INSERT, UPDATE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;

ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read decisions"
  ON public.decisions FOR SELECT TO authenticated
  USING (public.is_current_user_admin());
CREATE POLICY "Admins write decisions"
  ON public.decisions FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_admin());
CREATE POLICY "Admins settle decisions"
  ON public.decisions FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
-- No DELETE policy and no DELETE grant: a refuted decision is the most
-- valuable row in this table and is never removed.

CREATE INDEX decisions_review_idx ON public.decisions (status, review_on);

-- Decisions whose review date has arrived and that are still awaiting a
-- verdict. Read by the cockpit and by founder-daily-brief so the same
-- definition of "due" serves both.
CREATE OR REPLACE FUNCTION public.decisions_due(p_on date DEFAULT NULL)
RETURNS TABLE(
  id uuid, decided_on date, title text, decision text, expected_outcome text,
  metric_key text, baseline_value numeric, expected_value numeric,
  review_on date, days_overdue int
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT d.id, d.decided_on, d.title, d.decision, d.expected_outcome,
         d.metric_key, d.baseline_value, d.expected_value, d.review_on,
         (coalesce(p_on, now()::date) - d.review_on)::int
  FROM public.decisions d
  WHERE d.status = 'open'
    AND d.review_on IS NOT NULL
    AND d.review_on <= coalesce(p_on, now()::date)
  ORDER BY d.review_on ASC;
$$;

REVOKE ALL ON FUNCTION public.decisions_due(date) FROM public;
GRANT EXECUTE ON FUNCTION public.decisions_due(date) TO service_role;
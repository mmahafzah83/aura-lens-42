-- ── labels: one member answer per opportunity ───────────────────────────────
ALTER TABLE public.oe_labels ADD COLUMN IF NOT EXISTS reason text;
UPDATE public.oe_labels SET label = 'no' WHERE label NOT IN ('yes','maybe','no');
ALTER TABLE public.oe_labels DROP CONSTRAINT IF EXISTS oe_labels_label_check;
ALTER TABLE public.oe_labels ADD CONSTRAINT oe_labels_label_check CHECK (label IN ('yes','maybe','no'));
CREATE UNIQUE INDEX IF NOT EXISTS oe_labels_user_opportunity ON public.oe_labels (user_id, opportunity_id);
DROP POLICY IF EXISTS "labels admin read" ON public.oe_labels;
CREATE POLICY "labels admin read" ON public.oe_labels FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_labels TO authenticated;
GRANT ALL ON public.oe_labels TO service_role;

-- ── the priority that decided a read ────────────────────────────────────────
ALTER TABLE public.oe_candidates ADD COLUMN IF NOT EXISTS priority numeric;

-- ── the calibrated bar ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.oe_calibration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  threshold numeric NOT NULL,
  n_labels integer NOT NULL DEFAULT 0,
  precision_at_3 numeric,
  recall numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_calibration TO authenticated;
GRANT ALL ON public.oe_calibration TO service_role;
ALTER TABLE public.oe_calibration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "calibration read own or global" ON public.oe_calibration;
CREATE POLICY "calibration read own or global" ON public.oe_calibration FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE UNIQUE INDEX IF NOT EXISTS oe_calibration_scope
  ON public.oe_calibration ((COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)));
DROP TRIGGER IF EXISTS oe_calibration_touch ON public.oe_calibration;
CREATE TRIGGER oe_calibration_touch BEFORE UPDATE ON public.oe_calibration
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── the scan: the threshold that maximises precision@3 on a label set ───────
CREATE OR REPLACE FUNCTION public.oe_calibrate_scan(p_users uuid[])
RETURNS TABLE(threshold numeric, n_labels integer, precision_at_3 numeric, recall numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH lab AS (
    SELECT l.user_id, l.opportunity_id, l.label, m.score_avg
    FROM public.oe_labels l
    JOIN public.oe_matches m
      ON m.user_id = l.user_id AND m.opportunity_id = l.opportunity_id
    WHERE l.label IN ('yes','maybe','no')
      AND m.score_avg IS NOT NULL
      AND (p_users IS NULL OR l.user_id = ANY(p_users))
  ), grid AS (
    SELECT generate_series(0, 50)::numeric / 10 AS t
  ), scored AS (
    SELECT g.t,
      (SELECT count(*) FROM lab) AS n,
      (SELECT COALESCE(avg(CASE x.label WHEN 'yes' THEN 1 WHEN 'maybe' THEN 0.5 ELSE 0 END), 0)
         FROM (SELECT * FROM lab WHERE lab.score_avg >= g.t ORDER BY lab.score_avg DESC LIMIT 3) x) AS p3,
      (SELECT count(*) FILTER (WHERE lab.label = 'yes' AND lab.score_avg >= g.t)::numeric
            / NULLIF(count(*) FILTER (WHERE lab.label = 'yes'), 0) FROM lab) AS rec
    FROM grid g
  )
  SELECT s.t, s.n::int, round(s.p3, 4), round(s.rec, 4)
  FROM scored s
  ORDER BY s.p3 DESC NULLS LAST, s.rec DESC NULLS LAST, s.t ASC
  LIMIT 1;
$$;

-- ── the nightly calibration ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oe_calibrate(p_user uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_default numeric;
  v_members integer;
  u uuid;
  s record;
  n integer := 0;
BEGIN
  SELECT COALESCE((params->>'gate_min_avg')::numeric, 3.0) INTO v_default
  FROM public.oe_policy_versions WHERE active LIMIT 1;
  v_default := COALESCE(v_default, 3.0);

  FOR u IN SELECT DISTINCT user_id FROM public.oe_labels
           WHERE p_user IS NULL OR user_id = p_user LOOP
    SELECT * INTO s FROM public.oe_calibrate_scan(ARRAY[u]);
    INSERT INTO public.oe_calibration (user_id, threshold, n_labels, precision_at_3, recall, computed_at)
    VALUES (
      u,
      CASE WHEN COALESCE(s.n_labels, 0) >= 10 THEN s.threshold ELSE v_default END,
      COALESCE(s.n_labels, 0),
      CASE WHEN COALESCE(s.n_labels, 0) >= 10 THEN s.precision_at_3 END,
      CASE WHEN COALESCE(s.n_labels, 0) >= 10 THEN s.recall END,
      now())
    ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE
      SET threshold = EXCLUDED.threshold, n_labels = EXCLUDED.n_labels,
          precision_at_3 = EXCLUDED.precision_at_3, recall = EXCLUDED.recall,
          computed_at = EXCLUDED.computed_at;
    n := n + 1;
  END LOOP;

  -- The global bar may only move on the answers of three or more members.
  SELECT count(DISTINCT l.user_id) INTO v_members
  FROM public.oe_labels l
  JOIN public.oe_matches m ON m.user_id = l.user_id AND m.opportunity_id = l.opportunity_id
  WHERE l.label IN ('yes','maybe','no') AND m.score_avg IS NOT NULL;

  IF v_members >= 3 THEN
    SELECT * INTO s FROM public.oe_calibrate_scan(NULL);
  ELSE
    s := NULL;
  END IF;

  INSERT INTO public.oe_calibration (user_id, threshold, n_labels, precision_at_3, recall, computed_at)
  VALUES (NULL,
    COALESCE(s.threshold, v_default),
    COALESCE(s.n_labels, 0),
    s.precision_at_3,
    s.recall,
    now())
  ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE
    SET threshold = EXCLUDED.threshold, n_labels = EXCLUDED.n_labels,
        precision_at_3 = EXCLUDED.precision_at_3, recall = EXCLUDED.recall,
        computed_at = EXCLUDED.computed_at;

  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.oe_calibrate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.oe_calibrate_scan(uuid[]) TO service_role;

SELECT cron.unschedule('oe-calibrate-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oe-calibrate-daily');
SELECT cron.schedule('oe-calibrate-daily', '40 3 * * *',
  $q$do $inner$ begin if public.oe_run_allowed('oe-calibrate-daily') then perform public.oe_calibrate(); end if; end $inner$;$q$);

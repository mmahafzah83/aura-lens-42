CREATE OR REPLACE FUNCTION public.oe_calibrate(p_user uuid DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_default numeric;
  v_members integer;
  u uuid;
  s record;
  g_threshold numeric;
  g_n integer := 0;
  g_p3 numeric;
  g_rec numeric;
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
    SELECT sc.threshold, sc.n_labels, sc.precision_at_3, sc.recall
      INTO g_threshold, g_n, g_p3, g_rec
    FROM public.oe_calibrate_scan(NULL) sc;
  END IF;

  INSERT INTO public.oe_calibration (user_id, threshold, n_labels, precision_at_3, recall, computed_at)
  VALUES (NULL, COALESCE(g_threshold, v_default), COALESCE(g_n, 0), g_p3, g_rec, now())
  ON CONFLICT (COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO UPDATE
    SET threshold = EXCLUDED.threshold, n_labels = EXCLUDED.n_labels,
        precision_at_3 = EXCLUDED.precision_at_3, recall = EXCLUDED.recall,
        computed_at = EXCLUDED.computed_at;

  RETURN n;
END $$;

REVOKE EXECUTE ON FUNCTION public.oe_calibrate(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.oe_calibrate_scan(uuid[]) FROM PUBLIC;
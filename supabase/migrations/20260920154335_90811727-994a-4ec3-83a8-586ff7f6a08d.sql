CREATE OR REPLACE FUNCTION public.oe_reconcile_judging()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_classified int := 0; v_checked int := 0; v_members int := 0; v_enqueued int := 0;
        v_screen int := 0; r record;
BEGIN
  UPDATE public.oe_opportunities o SET kind = public.oe_classify_kind(o)
   WHERE o.alive AND o.kind IS NULL;
  GET DIAGNOSTICS v_classified = ROW_COUNT;
  IF v_classified > 0 THEN v_checked := public.oe_apply_shape_state(); END IF;

  -- behind on judging: a live record with no match row of his own
  FOR r IN
    SELECT DISTINCT u.user_id FROM public.oe_unjudged_alive u
    WHERE (SELECT count(DISTINCT f.face) FROM public.oe_faces f WHERE f.user_id = u.user_id) >= 5
  LOOP
    v_members := v_members + 1;
    BEGIN
      INSERT INTO public.job_queue(job_type, user_id, payload, priority, max_attempts)
      VALUES ('oe_judge_member', r.user_id, '{}'::jsonb, 2, 2);
      v_enqueued := v_enqueued + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  -- behind on screening: a judged match with no screening verdict
  FOR r IN
    SELECT DISTINCT m.user_id FROM public.oe_matches m
    JOIN public.oe_opportunities o ON o.id = m.opportunity_id AND o.alive
    WHERE m.screen_outcome IS NULL
  LOOP
    BEGIN
      INSERT INTO public.job_queue(job_type, user_id, payload, priority, max_attempts)
      VALUES ('oe_screen_member', r.user_id, '{}'::jsonb, 2, 2);
      v_screen := v_screen + 1;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'classified', v_classified, 'completeness_rechecked', v_checked,
    'members_behind', v_members, 'enqueued_judging', v_enqueued,
    'enqueued_screening', v_screen,
    'unjudged_alive', (SELECT count(*) FROM public.oe_unjudged_alive),
    'unscreened_matches', (SELECT count(*) FROM public.oe_matches m
                            JOIN public.oe_opportunities o ON o.id=m.opportunity_id AND o.alive
                           WHERE m.screen_outcome IS NULL),
    'at', now());
END $$;
REVOKE ALL ON FUNCTION public.oe_reconcile_judging() FROM public, anon, authenticated;
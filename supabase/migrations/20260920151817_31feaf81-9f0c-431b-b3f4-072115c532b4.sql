-- The catalogue decides the shape; the state decides whether a shape is allowed at all.
CREATE OR REPLACE FUNCTION public.oe_classify_kind(o public.oe_opportunities)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_text text; k record;
BEGIN
  IF o.access_state IN ('observed_event','possible_need') THEN RETURN 'market_signal'; END IF;
  v_text := concat_ws(' ', COALESCE(o.title,''), COALESCE(o.scope,''), COALESCE(o.evidence_quote,''), COALESCE(o.chair_type,''));
  FOR k IN SELECT code, detect_en, detect_ar FROM public.oe_opportunity_kinds
           WHERE code <> 'market_signal' ORDER BY sort_order LOOP
    IF (NULLIF(k.detect_en,'') IS NOT NULL AND v_text ~* k.detect_en)
       OR (NULLIF(k.detect_ar,'') IS NOT NULL AND v_text ~ k.detect_ar) THEN
      RETURN k.code;
    END IF;
  END LOOP;
  RETURN 'market_signal';
END $$;
REVOKE ALL ON FUNCTION public.oe_classify_kind(public.oe_opportunities) FROM public, anon, authenticated;

-- A live record without a kind cannot exist. Fires before the shape/state guard,
-- which then has the last word.
CREATE OR REPLACE FUNCTION public.oe_set_kind_on_alive()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.alive AND NEW.kind IS NULL THEN
    NEW.kind := public.oe_classify_kind(NEW);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oe_classify_kind ON public.oe_opportunities;
CREATE TRIGGER trg_oe_classify_kind
  BEFORE INSERT OR UPDATE ON public.oe_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.oe_set_kind_on_alive();

-- THE STANDING CHECK. A live record no judge has looked at for a consenting member.
CREATE OR REPLACE VIEW public.oe_unjudged_alive
WITH (security_invoker = on) AS
SELECT c.user_id, o.id AS opportunity_id, o.title, o.kind, o.created_at
FROM public.oe_opportunities o
CROSS JOIN (SELECT DISTINCT user_id FROM public.oe_consents
            WHERE kind = 'matching' AND revoked_at IS NULL) c
WHERE o.alive
  AND NOT EXISTS (SELECT 1 FROM public.oe_matches m
                  WHERE m.opportunity_id = o.id AND m.user_id = c.user_id);
GRANT SELECT ON public.oe_unjudged_alive TO service_role;

-- THE RECONCILER. Classifies what arrived, then puts every member who is behind
-- back in the judging queue. Runs on a schedule; needs no one to ask.
CREATE OR REPLACE FUNCTION public.oe_reconcile_judging()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_classified int := 0; v_checked int := 0; v_members int := 0; v_enqueued int := 0; r record;
BEGIN
  UPDATE public.oe_opportunities o SET kind = public.oe_classify_kind(o)
   WHERE o.alive AND o.kind IS NULL;
  GET DIAGNOSTICS v_classified = ROW_COUNT;
  IF v_classified > 0 THEN v_checked := public.oe_apply_shape_state(); END IF;

  FOR r IN
    SELECT DISTINCT u.user_id
    FROM public.oe_unjudged_alive u
    WHERE (SELECT count(DISTINCT f.face) FROM public.oe_faces f WHERE f.user_id = u.user_id) >= 5
  LOOP
    v_members := v_members + 1;
    BEGIN
      INSERT INTO public.job_queue(job_type, user_id, payload, priority, max_attempts)
      VALUES ('oe_judge_member', r.user_id, '{}'::jsonb, 2, 2);
      v_enqueued := v_enqueued + 1;
    EXCEPTION WHEN unique_violation THEN NULL;  -- one live job per member is the rule
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'classified', v_classified, 'completeness_rechecked', v_checked,
    'members_behind', v_members, 'enqueued', v_enqueued,
    'unjudged_alive', (SELECT count(*) FROM public.oe_unjudged_alive),
    'at', now());
END $$;
REVOKE ALL ON FUNCTION public.oe_reconcile_judging() FROM public, anon, authenticated;
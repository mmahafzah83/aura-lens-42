CREATE OR REPLACE FUNCTION public.oe_apply_shape_state()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer := 0; r public.oe_opportunities%ROWTYPE; v_text text; v_open boolean;
        v_req jsonb; v_missing jsonb; v_present jsonb; v_verdict text; v_prev text; v_reason text;
BEGIN
  FOR r IN SELECT o.* FROM public.oe_opportunities o WHERE o.alive LOOP
    v_prev := NULLIF(r.kind_completeness->>'reclassified_from','');
    v_reason := NULLIF(r.kind_completeness->>'reclassified_reason','');

    IF r.kind = 'board_seat' THEN
      v_text := COALESCE(r.evidence_quote,'') || ' ' || COALESCE(r.title,'') || ' ' || COALESCE(r.scope,'');
      SELECT (v_text ~* k.detect_en) OR (v_text ~ k.detect_ar) INTO v_open
        FROM public.oe_opportunity_kinds k WHERE k.code = 'board_seat';
      IF NOT COALESCE(v_open,false) THEN
        v_prev := COALESCE(v_prev,'board_seat');
        v_reason := 'no_open_nomination_window';
        r.kind := 'market_signal';
      END IF;
    END IF;

    IF r.access_state IN ('observed_event','possible_need')
       AND r.kind IS NOT NULL AND r.kind <> 'market_signal' THEN
      v_prev := COALESCE(v_prev, r.kind);
      v_reason := COALESCE(v_reason,'state_does_not_support_shape');
      r.kind := 'market_signal';
    END IF;

    -- a record that is back on its own shape is no longer a mismatch
    IF r.kind <> 'market_signal' THEN v_prev := NULL; v_reason := NULL; END IF;

    SELECT k.required_fields INTO v_req FROM public.oe_opportunity_kinds k WHERE k.code = r.kind;
    v_req := COALESCE(v_req,'[]'::jsonb);

    SELECT COALESCE(jsonb_agg(f.value) FILTER (WHERE NOT public.oe_kind_field_present(r, f.value #>> '{}')),'[]'::jsonb),
           COALESCE(jsonb_agg(f.value) FILTER (WHERE public.oe_kind_field_present(r, f.value #>> '{}')),'[]'::jsonb)
      INTO v_missing, v_present
      FROM jsonb_array_elements(v_req) f;

    IF v_prev IS NOT NULL THEN v_verdict := 'kind_mismatch';
    ELSIF jsonb_array_length(v_missing) = 0 THEN v_verdict := 'complete';
    ELSE v_verdict := 'incomplete'; END IF;

    UPDATE public.oe_opportunities o SET
      kind = r.kind,
      kind_completeness = jsonb_strip_nulls(jsonb_build_object(
        'verdict', v_verdict,
        'complete', (jsonb_array_length(v_missing) = 0),
        'missing', v_missing,
        'present', v_present,
        'reclassified_from', v_prev,
        'reclassified_reason', v_reason,
        'checked_at', now()))
    WHERE o.id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.oe_apply_shape_state() FROM public, anon, authenticated;
SELECT public.oe_apply_shape_state();
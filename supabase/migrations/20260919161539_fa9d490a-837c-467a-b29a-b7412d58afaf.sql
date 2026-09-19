-- Rule 3: a board seat needs an OPEN nomination window, not board vocabulary.
UPDATE public.oe_opportunity_kinds SET
  detect_en = '\y(nominations? (are )?open|call for nominations|invites? (applications|nominations)|seeking (candidates|nominees)|apply for the (board|seat))\y',
  detect_ar = '(فتح باب الترشيح|يدعو الراغبين في الترشح|استقبال طلبات الترشح|الراغبين في الترشح أن يتقدموا)'
WHERE code = 'board_seat';

-- Which column carries a required field.
CREATE OR REPLACE FUNCTION public.oe_kind_field_present(o public.oe_opportunities, p_field text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_field
    WHEN 'company' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'issuer' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'employer' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'counterparty' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'body' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'institution' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'publication' THEN COALESCE(NULLIF(trim(o.issuer_raw),''), o.issuer_id::text) IS NOT NULL
    WHEN 'programme' THEN NULLIF(trim(o.title),'') IS NOT NULL
    WHEN 'event_name' THEN NULLIF(trim(o.title),'') IS NOT NULL
    WHEN 'title' THEN NULLIF(trim(o.title),'') IS NOT NULL
    WHEN 'seat_type' THEN NULLIF(trim(o.chair_type),'') IS NOT NULL
    WHEN 'arrangement_type' THEN NULLIF(trim(o.chair_type),'') IS NOT NULL
    WHEN 'engagement_type' THEN NULLIF(trim(o.chair_type),'') IS NOT NULL
    WHEN 'membership_grade' THEN NULLIF(trim(o.chair_type),'') IS NOT NULL
    WHEN 'category_or_jury' THEN NULLIF(trim(o.chair_type),'') IS NOT NULL
    WHEN 'level' THEN COALESCE(NULLIF(trim(o.level_band),''), NULLIF(trim(o.seniority_band),'')) IS NOT NULL
    WHEN 'location' THEN NULLIF(trim(o.location),'') IS NOT NULL
    WHEN 'scope' THEN NULLIF(trim(o.scope),'') IS NOT NULL
    WHEN 'remit' THEN NULLIF(trim(o.scope),'') IS NOT NULL
    WHEN 'call_theme' THEN NULLIF(trim(o.scope),'') IS NOT NULL
    WHEN 'eligibility' THEN COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(o.requirements)='array' THEN o.requirements ELSE '[]'::jsonb END),0) > 0
    WHEN 'terms_or_stage' THEN NULLIF(trim(o.scope),'') IS NOT NULL
    WHEN 'event_description' THEN COALESCE(NULLIF(trim(o.scope),''), NULLIF(trim(o.title),'')) IS NOT NULL
    WHEN 'nomination_opens' THEN COALESCE(o.posting_date, o.signal_date) IS NOT NULL
    WHEN 'event_date' THEN COALESCE(o.signal_date, o.posting_date) IS NOT NULL
    WHEN 'nomination_closes' THEN o.deadline IS NOT NULL
    WHEN 'closing_date' THEN o.deadline IS NOT NULL
    WHEN 'submission_deadline' THEN o.deadline IS NOT NULL
    WHEN 'nomination_deadline' THEN o.deadline IS NOT NULL
    WHEN 'submission_route' THEN NULLIF(trim(o.route_url),'') IS NOT NULL
    WHEN 'submission_portal' THEN NULLIF(trim(o.route_url),'') IS NOT NULL
    WHEN 'application_route' THEN NULLIF(trim(o.route_url),'') IS NOT NULL
    WHEN 'contact_route' THEN NULLIF(trim(o.route_url),'') IS NOT NULL
    WHEN 'appointment_route' THEN NULLIF(trim(o.route_url),'') IS NOT NULL
    WHEN 'evidence_quote' THEN NULLIF(trim(o.evidence_quote),'') IS NOT NULL
    ELSE false END;
$$;

-- Rule 1, enforced by the database: the shape may not assert more than the state supports.
CREATE OR REPLACE FUNCTION public.oe_enforce_shape_state()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.access_state IN ('observed_event','possible_need')
     AND NEW.kind IS NOT NULL AND NEW.kind <> 'market_signal' THEN
    NEW.kind_completeness := COALESCE(NEW.kind_completeness,'{}'::jsonb)
      || jsonb_build_object('verdict','kind_mismatch',
                            'reclassified_from', NEW.kind,
                            'reclassified_reason','state_does_not_support_shape');
    NEW.kind := 'market_signal';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oe_enforce_shape_state ON public.oe_opportunities;
CREATE TRIGGER trg_oe_enforce_shape_state
  BEFORE INSERT OR UPDATE ON public.oe_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.oe_enforce_shape_state();

-- Deterministic re-classification and completeness, three verdicts.
CREATE OR REPLACE FUNCTION public.oe_apply_shape_state()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer := 0; r public.oe_opportunities%ROWTYPE; v_text text; v_open boolean;
        v_req jsonb; v_missing jsonb; v_present jsonb; v_verdict text; v_prev text;
BEGIN
  FOR r IN SELECT o.* FROM public.oe_opportunities o WHERE o.alive LOOP
    v_prev := NULL;

    -- Rule 3: board_seat requires an open nomination window.
    IF r.kind = 'board_seat' THEN
      v_text := COALESCE(r.evidence_quote,'') || ' ' || COALESCE(r.title,'') || ' ' || COALESCE(r.scope,'');
      SELECT (v_text ~* k.detect_en) OR (v_text ~ k.detect_ar) INTO v_open
        FROM public.oe_opportunity_kinds k WHERE k.code = 'board_seat';
      IF NOT COALESCE(v_open,false) THEN
        v_prev := 'board_seat';
        r.kind := 'market_signal';
      END IF;
    END IF;

    -- Rule 1: the state caps the shape.
    IF r.access_state IN ('observed_event','possible_need')
       AND r.kind IS NOT NULL AND r.kind <> 'market_signal' THEN
      v_prev := COALESCE(v_prev, r.kind);
      r.kind := 'market_signal';
    END IF;

    SELECT k.required_fields INTO v_req FROM public.oe_opportunity_kinds k WHERE k.code = r.kind;
    v_req := COALESCE(v_req,'[]'::jsonb);

    SELECT COALESCE(jsonb_agg(f.value) FILTER (WHERE NOT public.oe_kind_field_present(r, f.value #>> '{}')),'[]'::jsonb),
           COALESCE(jsonb_agg(f.value) FILTER (WHERE public.oe_kind_field_present(r, f.value #>> '{}')),'[]'::jsonb)
      INTO v_missing, v_present
      FROM jsonb_array_elements(v_req) f;

    IF v_prev IS NOT NULL THEN
      v_verdict := 'kind_mismatch';
    ELSIF jsonb_array_length(v_missing) = 0 THEN
      v_verdict := 'complete';
    ELSE
      v_verdict := 'incomplete';
    END IF;

    UPDATE public.oe_opportunities o SET
      kind = r.kind,
      kind_completeness = jsonb_strip_nulls(jsonb_build_object(
        'verdict', v_verdict,
        'complete', (jsonb_array_length(v_missing) = 0),
        'missing', v_missing,
        'present', v_present,
        'reclassified_from', v_prev,
        'reclassified_reason', CASE WHEN v_prev IS NULL THEN NULL
          WHEN v_prev = 'board_seat' AND r.access_state NOT IN ('observed_event','possible_need')
            THEN 'no_open_nomination_window' ELSE 'state_does_not_support_shape' END,
        'checked_at', now()))
    WHERE o.id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.oe_apply_shape_state() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_kind_field_present(public.oe_opportunities, text) FROM public, anon, authenticated;

-- Only a genuinely incomplete record goes to investigation.
CREATE OR REPLACE FUNCTION public.oe_queue_kind_investigations(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer := 0;
BEGIN
  INSERT INTO public.oe_investigations (user_id, opportunity_id, field, status, attempts)
  SELECT p_user, o.id, 'kind_field:' || (f.value #>> '{}'), 'open', 0
  FROM public.oe_opportunities o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.kind_completeness->'missing','[]'::jsonb)) f
  WHERE o.alive
    AND COALESCE(o.kind_completeness->>'verdict','incomplete') = 'incomplete'
    AND EXISTS (SELECT 1 FROM public.oe_matches m WHERE m.user_id = p_user AND m.opportunity_id = o.id)
  ON CONFLICT (user_id, opportunity_id, field) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.oe_queue_kind_investigations(uuid) FROM public, anon, authenticated;

SELECT public.oe_apply_shape_state();
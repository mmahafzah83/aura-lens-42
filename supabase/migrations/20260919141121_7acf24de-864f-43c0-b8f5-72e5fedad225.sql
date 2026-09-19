CREATE OR REPLACE FUNCTION public.oe_queue_kind_investigations(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_n integer := 0;
BEGIN
  INSERT INTO public.oe_investigations (user_id, opportunity_id, field, status, attempts)
  SELECT p_user, o.id, 'kind_field:' || (f.value #>> '{}'), 'open', 0
  FROM public.oe_opportunities o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.kind_completeness->'missing','[]'::jsonb)) f
  WHERE o.alive
    AND EXISTS (SELECT 1 FROM public.oe_matches m WHERE m.user_id = p_user AND m.opportunity_id = o.id)
  ON CONFLICT (user_id, opportunity_id, field) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

REVOKE ALL ON FUNCTION public.oe_queue_kind_investigations(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.oe_app_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_core jsonb; v_cards jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.oe_assess_writing_value(v_uid);
  PERFORM public.oe_check_claims(v_uid);
  PERFORM public.oe_queue_kind_investigations(v_uid);
  v_core := public.oe_app_queue_core();

  SELECT COALESCE(jsonb_agg(
    c
    || jsonb_build_object(
      'access_state', o.access_state,
      'access_state_reason', o.access_state_reason,
      'kind', o.kind,
      'presentation_line', m.presentation_line,
      'stretch', (m.level_direction = 'two_plus'),
      'inference', CASE WHEN o.access_state IN ('observed_event','possible_need') THEN jsonb_build_object(
          'what_we_saw', o.evidence_quote,
          'what_we_infer', COALESCE(NULLIF(trim(o.scope),''), o.title),
          'what_would_confirm', CASE
            WHEN o.access_state='observed_event' THEN 'A statement that the work or the seat is being filled'
            ELSE 'A named opening, an invitation, or a channel specific to this piece of work' END)
        ELSE NULL END,
      'claims', COALESCE((SELECT jsonb_object_agg(cc.check_kind, cc.status) FROM oe_claim_checks cc
                           WHERE cc.user_id=v_uid AND cc.opportunity_id=o.id),'{}'::jsonb))
    || CASE WHEN EXISTS (SELECT 1 FROM oe_claim_checks cc WHERE cc.user_id=v_uid AND cc.opportunity_id=o.id AND cc.check_kind='actionability' AND cc.status<>'pass')
            THEN jsonb_build_object('route_url', NULL, 'route_kind', NULL) ELSE '{}'::jsonb END
    || CASE WHEN EXISTS (SELECT 1 FROM oe_claim_checks cc WHERE cc.user_id=v_uid AND cc.opportunity_id=o.id AND cc.check_kind='freshness' AND cc.status='fail')
            THEN jsonb_build_object('deadline', NULL) ELSE '{}'::jsonb END
    ORDER BY ord), '[]'::jsonb)
    INTO v_cards
  FROM (SELECT value AS c, ordinality AS ord FROM jsonb_array_elements(COALESCE(v_core->'cards','[]'::jsonb)) WITH ORDINALITY) x
  JOIN oe_opportunities o ON o.id = (x.c->>'opportunity_id')::uuid
  JOIN LATERAL (SELECT y.* FROM oe_matches y WHERE y.user_id=v_uid AND y.opportunity_id=o.id
                 ORDER BY y.judged_at DESC NULLS LAST LIMIT 1) m ON true
  WHERE NOT EXISTS (SELECT 1 FROM oe_write_value w WHERE w.user_id=v_uid AND w.opportunity_id=o.id AND w.verdict='discard')
    AND NOT EXISTS (SELECT 1 FROM oe_claim_checks cc WHERE cc.user_id=v_uid AND cc.opportunity_id=o.id
                     AND cc.check_kind='interpretation' AND cc.status='fail')
    -- the catalogue: a record missing a required field for its kind is not a card
    AND COALESCE((o.kind_completeness->>'complete')::boolean, false)
    -- the screening brain: three gates, then the line. No line, no card.
    AND m.screen_outcome = 'survivor'
    AND NULLIF(trim(COALESCE(m.presentation_line,'')),'') IS NOT NULL;

  RETURN jsonb_set(v_core, '{cards}', v_cards)
    || jsonb_build_object('coverage', COALESCE((SELECT jsonb_object_agg(stage, count) FROM oe_coverage_funnel),'{}'::jsonb));
END $function$;
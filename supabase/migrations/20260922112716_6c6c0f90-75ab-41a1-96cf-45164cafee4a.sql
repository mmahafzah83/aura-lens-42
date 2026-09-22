
CREATE OR REPLACE FUNCTION public.oe_app_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_core jsonb; v_cards jsonb; v_window jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.oe_assess_writing_value(v_uid);
  PERFORM public.oe_check_claims(v_uid);
  PERFORM public.oe_queue_kind_investigations(v_uid);
  PERFORM public.oe_goal_propose(v_uid);
  v_core := public.oe_app_queue_core();

  SELECT COALESCE(jsonb_agg(
    c
    || jsonb_build_object(
      'access_state', o.access_state,
      'access_state_reason', o.access_state_reason,
      'kind', o.kind,
      'cost_of_door', o.cost_of_door,
      'presentation_line', m.presentation_line,
      'level_direction', m.level_direction,
      'employer_tier', m.employer_tier,
      'interest', m.interest,
      'presentation_evidence', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'claim', e.claim, 'quote', e.quote, 'source', e.source_table, 'position', e.position_ref, 'own_record', e.own_record))
                                          FROM oe_member_evidence e WHERE e.id = ANY(m.presentation_evidence_ids)), '[]'::jsonb),
      'gap_question', (SELECT jsonb_build_object('investigation_id', i.id, 'field', i.field, 'question', i.member_question)
                         FROM oe_investigations i
                        WHERE i.user_id=v_uid AND i.opportunity_id=o.id
                          AND i.member_question IS NOT NULL AND i.answered_at IS NULL
                          AND i.asked_on = CURRENT_DATE
                        ORDER BY i.created_at DESC LIMIT 1),
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
    AND COALESCE((o.kind_completeness->>'complete')::boolean, false)
    AND m.screen_outcome = 'survivor'
    AND NULLIF(trim(COALESCE(m.presentation_line,'')),'') IS NOT NULL;

  v_window := public.oe_goal_window(v_uid);

  RETURN jsonb_set(
           jsonb_set(v_core, '{cards}', v_cards),
           '{history}', COALESCE((
             SELECT jsonb_agg(h) FROM jsonb_array_elements(COALESCE(v_core->'history','[]'::jsonb)) h
              WHERE NULLIF(h->>'title','') IS NOT NULL), '[]'::jsonb))
    || jsonb_build_object('coverage', COALESCE((SELECT jsonb_object_agg(stage, count) FROM oe_coverage_funnel),'{}'::jsonb))
    || jsonb_build_object('direction', (SELECT to_jsonb(d) FROM oe_direction d WHERE d.user_id=v_uid))
    || jsonb_build_object('window', v_window)
    || jsonb_build_object('metrics', jsonb_build_object(
         'sources_read', (SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),
         'organisations', (SELECT count(*) FROM oe_entities),
         'judged_week', (SELECT count(*) FROM oe_matches WHERE user_id=v_uid AND judged_at >= now() - interval '7 days'),
         'survived', (SELECT count(*) FROM oe_matches WHERE user_id=v_uid AND screen_outcome='survivor'),
         'shown', (SELECT count(*) FROM oe_serves WHERE user_id=v_uid AND opportunity_id IS NOT NULL),
         'first_card_expected', v_window->>'expected_by'))
    || jsonb_build_object('filters', COALESCE((
         SELECT jsonb_object_agg(n.field, jsonb_build_object('op', n.op, 'values', COALESCE(n."values", ARRAY[n.value])))
           FROM oe_notebook n
          WHERE n.user_id=v_uid AND n.entry_kind='rule' AND n.origin='stated'
            AND n.status='active' AND n.field IS NOT NULL), '{}'::jsonb))
    || jsonb_build_object('proposed_rules', COALESCE((
         SELECT jsonb_agg(jsonb_build_object('id', n.id, 'rule_text', n.rule_text, 'field', n.field,
                                             'op', n.op, 'value', n.value, 'values', n."values",
                                             'derived_from', n.derived_from) ORDER BY n.field)
           FROM oe_notebook n
          WHERE n.user_id=v_uid AND n.entry_kind='rule' AND n.status='proposed'), '[]'::jsonb));
END $function$;

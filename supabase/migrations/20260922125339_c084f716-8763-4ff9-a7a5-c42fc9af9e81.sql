
-- ─────────────────────────────────────────────────────────────────────────────
-- Step 41 — the tab must say only what is true.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. A blocked host must never be admitted, whichever door it comes through.
CREATE OR REPLACE FUNCTION public.oe_host_is_skipped(p_url text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH h AS (
    SELECT lower(regexp_replace(split_part(regexp_replace(COALESCE(p_url,''), '^https?://', ''), '/', 1), '^www\.', '')) AS host
  ), blocked AS (
    SELECT lower(x) AS b
      FROM oe_policy_versions p,
           LATERAL jsonb_array_elements_text(
             COALESCE(p.params->'discovery_skip_hosts','[]'::jsonb) || COALESCE(p.params->'never_read','[]'::jsonb)) x
     WHERE p.active
  )
  SELECT EXISTS (
    SELECT 1 FROM h JOIN blocked ON h.host = blocked.b OR h.host LIKE '%.' || blocked.b
     WHERE h.host <> ''
  );
$$;

CREATE OR REPLACE FUNCTION public.oe_enforce_skipped_hosts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.source_url IS NOT NULL AND public.oe_host_is_skipped(NEW.source_url) THEN
    NEW.alive := false;
    NEW.dead_reason := 'skipped_host';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oe_opportunities_skipped_hosts ON public.oe_opportunities;
CREATE TRIGGER oe_opportunities_skipped_hosts
BEFORE INSERT OR UPDATE OF source_url, alive ON public.oe_opportunities
FOR EACH ROW EXECUTE FUNCTION public.oe_enforce_skipped_hosts();

-- 2. The queue payload: honest history, honest metrics, honest reading state.
CREATE OR REPLACE FUNCTION public.oe_app_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_uid uuid := auth.uid(); v_core jsonb; v_cards jsonb; v_window jsonb; v_history jsonb; v_reading jsonb;
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

  -- History: only what was actually served to him, and each row keeps its OWN
  -- employer. Several records can share one resolved issuer row, so the
  -- record's own reading (issuer_raw) is what the screen prints.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'shown_at', x.shown_at, 'lane', x.lane, 'tap', x.tap, 'tap_scope', x.tap_scope,
           'tap_scope_value', x.tap_scope_value, 'tapped_at', x.tapped_at, 'truth_code', x.truth_code,
           'outcome', x.outcome, 'outcome_at', x.outcome_at, 'title', o.title,
           'issuer_name', COALESCE(NULLIF(trim(o.issuer_raw),''), e.name, i.canonical_name),
           'location', o.location, 'presentation_line', lm.presentation_line)
         ORDER BY x.shown_at DESC), '[]'::jsonb)
    INTO v_history
  FROM (SELECT * FROM oe_serves
         WHERE user_id=v_uid AND COALESCE(channel,'') <> 'test' AND card_id IS NOT NULL
         ORDER BY shown_at DESC LIMIT 60) x
  JOIN oe_opportunities o ON o.id = x.opportunity_id
  LEFT JOIN oe_entities e ON e.id = o.issuer_id
  LEFT JOIN oe_issuers i ON i.id = o.issuer_id
  LEFT JOIN LATERAL (SELECT m.presentation_line FROM oe_matches m
                      WHERE m.user_id=v_uid AND m.opportunity_id=o.id
                      ORDER BY m.judged_at DESC LIMIT 1) lm ON true
  WHERE NULLIF(trim(COALESCE(o.title,'')),'') IS NOT NULL;

  -- Reading state: running, or the last pass that finished.
  SELECT jsonb_build_object(
    'running', EXISTS (SELECT 1 FROM job_queue j
                        WHERE j.job_type IN ('oe_fetch_feed','oe_read_candidate')
                          AND j.status IN ('pending','claimed'))
               OR EXISTS (SELECT 1 FROM oe_runs r
                           WHERE r.run_kind='fetch_feed' AND r.finished_at IS NULL
                             AND r.started_at > now() - interval '15 minutes'),
    'last_read_at', (SELECT max(r.finished_at) FROM oe_runs r
                      WHERE r.run_kind IN ('fetch_feed','harvest') AND r.finished_at IS NOT NULL))
    INTO v_reading;

  RETURN jsonb_set(jsonb_set(v_core, '{cards}', v_cards), '{history}', v_history)
    || jsonb_build_object('coverage', COALESCE((SELECT jsonb_object_agg(stage, count) FROM oe_coverage_funnel),'{}'::jsonb))
    || jsonb_build_object('direction', (SELECT to_jsonb(d) FROM oe_direction d WHERE d.user_id=v_uid))
    || jsonb_build_object('window', v_window)
    || jsonb_build_object('reading', v_reading)
    || jsonb_build_object('card_kinds', to_jsonb(public.oe_card_kinds()))
    || jsonb_build_object('metrics', jsonb_build_object(
         'sources_read', (SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),
         'organisations', (SELECT count(*) FROM oe_entities),
         'judged_week', (SELECT count(*) FROM oe_matches WHERE user_id=v_uid AND judged_at >= now() - interval '7 days'),
         -- Survived means alive and still standing, not every verdict ever written.
         'survived', (SELECT count(*) FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
                       WHERE m.user_id=v_uid AND m.screen_outcome='survivor' AND o.alive),
         -- Shown means actually sent to him. Test rows are not sends.
         'shown', (SELECT count(*) FROM oe_serves WHERE user_id=v_uid AND opportunity_id IS NOT NULL
                    AND COALESCE(channel,'') <> 'test'),
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
END
$function$;

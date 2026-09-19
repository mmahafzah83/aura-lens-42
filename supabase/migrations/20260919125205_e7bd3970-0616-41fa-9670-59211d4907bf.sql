CREATE OR REPLACE FUNCTION public.oe_assess_writing_value(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_sectors text[]; v_allowed text[]; v_n integer;
BEGIN
  SELECT sectors_core, countries_allowed INTO v_sectors, v_allowed FROM oe_eligibility WHERE user_id=p_user;
  v_sectors := COALESCE(v_sectors,'{}'::text[]); v_allowed := COALESCE(v_allowed,'{}'::text[]);

  WITH base AS (
    SELECT o.id, o.title, o.scope, o.sector, o.location, o.chair_type, o.evidence_quote, o.quote_verified,
           COALESCE(m.eligibility_fail,'{}'::text[]) fails,
           lower(concat_ws(' ', o.title, o.scope, o.sector)) txt,
           public.oe_place_country(o.location) country,
           (SELECT w.has_standing FROM oe_write_value w WHERE w.user_id=p_user AND w.opportunity_id=o.id) standing,
           (SELECT w.standing_reason FROM oe_write_value w WHERE w.user_id=p_user AND w.opportunity_id=o.id) standing_reason
      FROM oe_opportunities o
      JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=p_user ORDER BY x.judged_at DESC NULLS LAST LIMIT 1) m ON true
     WHERE o.alive
  ), checks AS (
    SELECT b.*,
      (EXISTS (SELECT 1 FROM unnest(v_sectors) s WHERE b.txt LIKE '%'||replace(s,'_','%')||'%')
       OR b.txt ~ '(water|utilit|energy|government|public sector|logistic|transport|digital|infrastructure)'
       OR COALESCE(b.country,'') = ANY (v_allowed)
       OR COALESCE(b.country,'') IN ('AE','QA','KW','BH','OM')) AS audience_fit,
      EXISTS (SELECT 1 FROM oe_faces f WHERE f.user_id=p_user AND NULLIF(trim(f.summary),'') IS NOT NULL
               AND b.txt ~ '(transform|digital|governance|operating model|strategy|strategic|infrastructure|data|\mai\M|programme|program|portfolio|policy|regulat|water|utilit|logistic)') AS has_viewpoint,
      (b.quote_verified IS TRUE AND NULLIF(trim(b.evidence_quote),'') IS NOT NULL
        AND (b.evidence_quote ~ '[0-9]' OR length(b.evidence_quote) > 120)) AS adds_something,
      (COALESCE(b.chair_type,'') <> 'role'
        OR b.txt ~ '(director|head of|chief|managing|partner|principal|board|general manager|vice president)') AS suits_positioning
    FROM base b
  ), verdicts AS (
    SELECT c.*,
      CASE
        -- standing to comment comes first: a man commenting outside his lane
        -- is discarded whatever the subject checks say
        WHEN c.standing IS FALSE THEN 'discard'
        WHEN ('place' = ANY(c.fails) OR 'nationality_mismatch' = ANY(c.fails))
             AND NOT (c.audience_fit AND c.adds_something) THEN 'discard'
        WHEN NOT (c.audience_fit OR c.has_viewpoint OR c.adds_something OR c.suits_positioning) THEN 'discard'
        ELSE 'keep' END AS verdict
    FROM checks c
  )
  INSERT INTO oe_write_value AS w (user_id,opportunity_id,audience_fit,has_viewpoint,adds_something,suits_positioning,verdict,reason,assessed_at)
  SELECT p_user, v.id, v.audience_fit, v.has_viewpoint, v.adds_something, v.suits_positioning, v.verdict,
    CASE WHEN v.verdict='discard' AND v.standing IS FALSE THEN COALESCE(v.standing_reason,'No standing to comment on this subject')
         WHEN v.verdict='discard' AND ('place' = ANY(v.fails) OR 'nationality_mismatch' = ANY(v.fails))
           THEN 'Ruled out on country or nationality, and the subject itself is not worth writing about'
         WHEN v.verdict='discard' THEN 'Fails all four writing checks'
         ELSE 'Passes at least one writing check' END, now()
  FROM verdicts v
  ON CONFLICT (user_id,opportunity_id) DO UPDATE
    SET audience_fit=EXCLUDED.audience_fit, has_viewpoint=EXCLUDED.has_viewpoint,
        adds_something=EXCLUDED.adds_something, suits_positioning=EXCLUDED.suits_positioning,
        verdict=EXCLUDED.verdict, reason=EXCLUDED.reason, assessed_at=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $function$;

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
  v_core := public.oe_app_queue_core();

  SELECT COALESCE(jsonb_agg(
    c
    || jsonb_build_object(
      'access_state', o.access_state,
      'access_state_reason', o.access_state_reason,
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
    -- the screening brain: three gates, then the line. No line, no card.
    AND m.screen_outcome = 'survivor'
    AND NULLIF(trim(COALESCE(m.presentation_line,'')),'') IS NOT NULL;

  RETURN jsonb_set(v_core, '{cards}', v_cards)
    || jsonb_build_object('coverage', COALESCE((SELECT jsonb_object_agg(stage, count) FROM oe_coverage_funnel),'{}'::jsonb));
END $function$;

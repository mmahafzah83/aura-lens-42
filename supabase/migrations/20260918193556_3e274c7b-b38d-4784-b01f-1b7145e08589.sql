CREATE OR REPLACE FUNCTION public.oe_app_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month date := date_trunc('month', current_date)::date;
  v_result jsonb;
  v_bad record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  FOR v_bad IN
    WITH candidates AS (
      SELECT o.id, o.lane_final, m.id AS match_id,
        COALESCE(jsonb_array_length(COALESCE(m.scores->'cites','[]'::jsonb)),0) AS cited_count
      FROM oe_opportunities o
      LEFT JOIN LATERAL (
        SELECT x.* FROM oe_matches x
        WHERE x.opportunity_id=o.id AND x.user_id=v_uid
        ORDER BY x.judged_at DESC LIMIT 1
      ) m ON true
      WHERE o.alive AND o.lane_final IN ('act','write')
        AND NOT EXISTS (
          SELECT 1 FROM oe_serves s
          WHERE s.user_id=v_uid AND s.opportunity_id=o.id
            AND s.tap IS NOT NULL AND s.tap <> 'later'
        )
    )
    SELECT c.id, c.lane_final,
      CASE
        WHEN NOT o.quote_verified OR NULLIF(trim(o.evidence_quote),'') IS NULL THEN 'verified_quote_missing'
        WHEN c.match_id IS NULL OR c.cited_count=0 THEN 'cited_evidence_missing'
      END AS reason
    FROM candidates c JOIN oe_opportunities o ON o.id=c.id
    WHERE NOT o.quote_verified OR NULLIF(trim(o.evidence_quote),'') IS NULL
       OR c.match_id IS NULL OR c.cited_count=0
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM ef_error_log
      WHERE function_name='oe_app_queue' AND user_id=v_uid
        AND context->>'opportunity_id'=v_bad.id::text
        AND created_at >= current_date
    ) THEN
      INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context)
      VALUES ('oe_app_queue',v_uid,'error','Opportunity omitted from app queue because its reason was not grounded',
        jsonb_build_object('opportunity_id',v_bad.id,'lane',v_bad.lane_final,'reason',v_bad.reason));
    END IF;
  END LOOP;

  WITH latest_matches AS (
    SELECT DISTINCT ON (m.opportunity_id) m.*
    FROM oe_matches m
    WHERE m.user_id=v_uid
    ORDER BY m.opportunity_id,m.judged_at DESC
  ), valid AS (
    SELECT o.*, m.scores, m.requirement_check, m.met_count, m.total_count,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face)
        FROM oe_faces f
        WHERE f.user_id=v_uid AND f.id IN (
          SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END
          FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite
          WHERE cite->>'kind'='face'
        ) AND NULLIF(trim(f.summary),'') IS NOT NULL
      ),'[]'::jsonb) AS evidence,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id)
        FROM oe_notebook n
        WHERE n.user_id=v_uid AND n.active AND n.proposal_status='signed' AND n.kind='hard'
          AND (
            o.lane_final='act'
            OR (n.field='sector' AND lower(COALESCE(o.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%')
            OR (n.field='place' AND (lower(COALESCE(o.location,'')) LIKE '%saudi%' OR lower(COALESCE(o.location,'')) LIKE '%riyadh%' OR lower(COALESCE(o.location,'')) LIKE '%ksa%'))
            OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(o.chair_type,''))<>lower(n.value))
            OR (n.op='exclude' AND n.field='level' AND lower(COALESCE(o.level_band,''))<>lower(n.value))
          )
      ),'[]'::jsonb) AS cleared_rules
    FROM oe_opportunities o
    JOIN latest_matches m ON m.opportunity_id=o.id
    WHERE o.alive AND o.lane_final IN ('act','write')
      AND o.quote_verified AND NULLIF(trim(o.evidence_quote),'') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite
        JOIN oe_faces f ON f.id=CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END AND f.user_id=v_uid
        WHERE cite->>'kind'='face' AND NULLIF(trim(f.summary),'') IS NOT NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM oe_serves s
        WHERE s.user_id=v_uid AND s.opportunity_id=o.id
          AND s.tap IS NOT NULL AND s.tap <> 'later'
      )
  ), ordered AS (
    SELECT v.*, row_number() OVER (PARTITION BY lane_final ORDER BY
      CASE WHEN lane_final='act' THEN deadline END ASC NULLS LAST, created_at DESC) AS lane_rank
    FROM valid v
  )
  SELECT jsonb_build_object(
    'cards', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', q.id, 'opportunity_id', q.id, 'lane', q.lane_final,
      'why_lines', q.evidence, 'gap_line', CASE WHEN NULLIF(trim(q.scores->>'gap'),'') IS NULL THEN NULL ELSE jsonb_build_object('text',q.scores->>'gap') END,
      'quote', q.evidence_quote, 'rule_ids', q.cleared_rules, 'rule_count', jsonb_array_length(q.cleared_rules),
      'title',q.title,'chair_type',q.chair_type,'level_band',q.level_band,'sector',q.sector,
      'location',q.location,'scope',q.scope,'deadline',q.deadline,'source_url',q.source_url,
      'route_url',q.route_url,'route_kind',q.route_kind,'issuer_id',q.issuer_id,'issuer_name',e.name,
      'last_checked',q.last_seen_at
    ) ORDER BY CASE WHEN q.lane_final='act' THEN 0 ELSE 1 END,
      CASE WHEN q.lane_final='act' THEN q.deadline END ASC NULLS LAST,q.created_at DESC)
      FROM ordered q LEFT JOIN oe_entities e ON e.id=q.issuer_id
      WHERE q.lane_final='act' OR q.lane_rank<=3),'[]'::jsonb),
    'surface_count',(SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),
    'entity_count',(SELECT count(*) FROM oe_entities),
    'rule_count',(SELECT count(*) FROM oe_notebook WHERE user_id=v_uid AND active AND proposal_status='signed'),
    'held_count',(SELECT count(*) FROM oe_suppressed WHERE user_id=v_uid AND day>=v_month),
    'rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind,n.stated_on DESC) FROM (
      SELECT id,kind,rule_text,rule_text_ar,field,op,value,stated_on FROM oe_notebook
      WHERE user_id=v_uid AND active AND proposal_status='signed') n),'[]'::jsonb),
    'held',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'day',s.day,'reason',s.reason,'rank',s.rank,'opportunity_id',s.opportunity_id,'title',o.title) ORDER BY s.day DESC,s.rank)
      FROM oe_suppressed s LEFT JOIN oe_opportunities o ON o.id=s.opportunity_id WHERE s.user_id=v_uid AND s.day>=v_month),'[]'::jsonb),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'shown_at',x.shown_at,'lane',x.lane,'tap',x.tap,'signal_class',x.signal_class,'truth_code',x.truth_code,'outcome',x.outcome,'why',x.why,'title',o.title) ORDER BY x.shown_at DESC)
      FROM (SELECT * FROM oe_serves WHERE user_id=v_uid ORDER BY shown_at DESC LIMIT 60) x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id),'[]'::jsonb),
    'due_outcomes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',o.title)) FROM oe_serves x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id
      WHERE x.user_id=v_uid AND x.tap='right' AND x.outcome IS NULL AND x.tapped_at BETWEEN now()-interval '15 days' AND now()-interval '13 days'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.oe_app_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_app_queue() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_render(p_card uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_opp oe_opportunities%ROWTYPE; v_match oe_matches%ROWTYPE;
  v_evidence jsonb; v_rules jsonb; v_why jsonb; v_serve uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_opp FROM oe_opportunities WHERE id=p_card AND alive AND lane_final IN ('act','write');
  IF NOT FOUND THEN RAISE EXCEPTION 'opportunity unavailable'; END IF;
  SELECT * INTO v_match FROM oe_matches WHERE opportunity_id=p_card AND user_id=v_uid ORDER BY judged_at DESC LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face),'[]'::jsonb) INTO v_evidence
  FROM oe_faces f WHERE f.user_id=v_uid AND f.id IN (
    SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END FROM jsonb_array_elements(COALESCE(v_match.scores->'cites','[]'::jsonb)) cite
    WHERE cite->>'kind'='face'
  ) AND NULLIF(trim(f.summary),'') IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id),'[]'::jsonb) INTO v_rules
  FROM oe_notebook n WHERE n.user_id=v_uid AND n.active AND n.proposal_status='signed' AND n.kind='hard'
    AND (v_opp.lane_final='act'
      OR (n.field='sector' AND lower(COALESCE(v_opp.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%')
      OR (n.field='place' AND (lower(COALESCE(v_opp.location,'')) LIKE '%saudi%' OR lower(COALESCE(v_opp.location,'')) LIKE '%riyadh%' OR lower(COALESCE(v_opp.location,'')) LIKE '%ksa%'))
      OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(v_opp.chair_type,''))<>lower(n.value))
      OR (n.op='exclude' AND n.field='level' AND lower(COALESCE(v_opp.level_band,''))<>lower(n.value)));
  IF NOT v_opp.quote_verified OR NULLIF(trim(v_opp.evidence_quote),'') IS NULL OR jsonb_array_length(v_evidence)=0 THEN
    INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context)
    VALUES('oe_app_render',v_uid,'error','Opportunity render refused because its reason was not grounded',jsonb_build_object('opportunity_id',p_card,'verified_quote',v_opp.quote_verified,'evidence_count',jsonb_array_length(v_evidence)));
    RETURN jsonb_build_object('ok',false,'reason','ungrounded');
  END IF;
  v_why:=jsonb_build_object('summary',v_evidence->0->>'text','evidence',v_evidence,'risk',COALESCE(v_match.scores->>'gap',''),'rule_ids',v_rules,'rule_count',jsonb_array_length(v_rules),'quote',v_opp.evidence_quote,'source_url',v_opp.source_url,'last_verified_at',v_opp.last_seen_at);
  INSERT INTO oe_serves(user_id,card_id,opportunity_id,channel,lane,why)
  VALUES(v_uid,NULL,p_card,'app',v_opp.lane_final,v_why) RETURNING id INTO v_serve;
  RETURN jsonb_build_object('ok',true,'serve_id',v_serve,'why',v_why);
END $$;
REVOKE ALL ON FUNCTION public.oe_app_render(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_app_render(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_decide(p_card uuid,p_action text,p_scope text DEFAULT NULL,p_scope_value text DEFAULT NULL,p_truth text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_uid uuid:=auth.uid(); v_serve oe_serves%ROWTYPE; v_count int:=0; v_proposal uuid; v_opp oe_opportunities%ROWTYPE;
BEGIN
  IF p_action NOT IN ('right','not_quite','later') THEN RAISE EXCEPTION 'unknown decision'; END IF;
  SELECT * INTO v_serve FROM oe_serves WHERE opportunity_id=p_card AND user_id=v_uid AND channel='app' AND tap IS NULL ORDER BY shown_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'serve unavailable'; END IF;
  SELECT * INTO v_opp FROM oe_opportunities WHERE id=p_card;
  IF p_action='later' THEN
    UPDATE oe_serves SET tap='later',tapped_at=now(),updated_at=now() WHERE id=v_serve.id;
    RETURN jsonb_build_object('ok',true,'later',true);
  END IF;
  IF p_truth IS NOT NULL THEN
    IF p_truth NOT IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer') THEN RAISE EXCEPTION 'unknown truth'; END IF;
    UPDATE oe_serves SET tap='not_my_area',tapped_at=now(),signal_class='truth',truth_code=p_truth,updated_at=now() WHERE id=v_serve.id;
    IF p_truth='dead_route' THEN UPDATE oe_opportunities SET route_dead=true WHERE id=p_card;
    ELSIF p_truth='quote_absent' THEN UPDATE oe_opportunities SET quote_verified=false WHERE id=p_card;
    ELSE UPDATE oe_opportunities SET alive=false WHERE id=p_card; END IF;
    INSERT INTO oe_world_facts(kind,payload,evidence_url,confidence)
    VALUES(CASE WHEN p_truth='listing_page' THEN 'aggregator_fingerprint' WHEN p_truth='already_happened' THEN 'recurring_event' ELSE 'route_pattern' END,
      jsonb_build_object('code',p_truth,'opportunity_id',p_card,'feed_id',v_opp.feed_id),COALESCE(v_opp.route_url,v_opp.source_url),0.8);
    RETURN jsonb_build_object('ok',true);
  END IF;
  UPDATE oe_serves SET tap=CASE WHEN p_action='right' THEN 'right' ELSE 'not_my_area' END,tapped_at=now(),tap_scope=p_scope,tap_scope_value=p_scope_value,
    signal_class=CASE WHEN p_action='not_quite' THEN 'taste' END,pursued=CASE WHEN p_action='right' THEN true ELSE pursued END,
    pursued_at=CASE WHEN p_action='right' THEN now() ELSE pursued_at END,updated_at=now() WHERE id=v_serve.id;
  IF p_action='not_quite' AND p_scope IS NOT NULL AND p_scope_value IS NOT NULL AND p_scope<>'just_this' THEN
    SELECT count(*) INTO v_count FROM oe_serves WHERE user_id=v_uid AND signal_class='taste' AND tap_scope=p_scope AND tap_scope_value=p_scope_value AND tapped_at>=now()-interval '30 days';
    IF v_count>=3 AND NOT EXISTS(SELECT 1 FROM oe_notebook WHERE user_id=v_uid AND field=p_scope AND value=p_scope_value AND (active OR expires_at>now())) THEN
      INSERT INTO oe_notebook(user_id,kind,rule_text,rule_text_ar,field,op,value,origin,proposal_status,proposed_because,active)
      VALUES(v_uid,'soft','Stop showing '||p_scope_value,'أوقف عرض '||p_scope_value,
        CASE p_scope WHEN 'type' THEN 'chair_type' WHEN 'level' THEN 'level' WHEN 'place' THEN 'place' WHEN 'issuer' THEN 'issuer' WHEN 'sector' THEN 'sector' ELSE NULL END,
        'exclude',p_scope_value,'stated','open',jsonb_build_object('declines_30d',v_count,'scope',p_scope),true) RETURNING id INTO v_proposal;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'proposal_id',v_proposal,'declines',v_count);
END $$;
REVOKE ALL ON FUNCTION public.oe_app_decide(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_app_decide(uuid,text,text,text,text) TO authenticated, service_role;

INSERT INTO public.oe_vocabulary(key,kind,en,ar) VALUES
('queue_clears_n_rules','label','Clears {n} of your rules','تجتاز {n} من قواعدك'),
('queue_sector','label','Sector','القطاع'),
('queue_organisation','label','Organisation','الجهة')
ON CONFLICT(key) DO UPDATE SET kind=EXCLUDED.kind,en=EXCLUDED.en,ar=EXCLUDED.ar,updated_at=now();
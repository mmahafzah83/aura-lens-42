CREATE OR REPLACE FUNCTION public.oe_app_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_month date:=date_trunc('month',current_date)::date; v_result jsonb; v_bad record;
  v_mix text; v_weights jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.oe_refresh_purpose(v_uid);
  SELECT COALESCE(d.mix,'win') INTO v_mix FROM oe_direction d WHERE d.user_id=v_uid;
  v_mix:=COALESCE(v_mix,'win');
  SELECT value->v_mix INTO v_weights FROM admin_settings WHERE key='oe_mix_weights';
  v_weights:=COALESCE(v_weights,'{"strength":0.70,"build":0.20,"explore":0.10}'::jsonb);

  FOR v_bad IN
    WITH candidates AS (
      SELECT o.id,m.lane_final,m.id match_id,COALESCE(jsonb_array_length(COALESCE(m.scores->'cites','[]'::jsonb)),0) cited_count,
             o.quote_verified,o.evidence_quote
      FROM oe_opportunities o LEFT JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=v_uid ORDER BY x.judged_at DESC LIMIT 1) m ON true
      WHERE o.alive AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
    )
    SELECT c.id,c.lane_final,
      CASE WHEN c.match_id IS NULL THEN 'not_judged_for_this_member'
           WHEN c.lane_final IS NULL OR c.lane_final NOT IN ('act','write') THEN 'no_lane'
           WHEN (NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL) AND c.cited_count=0 THEN 'quote_and_cite_missing'
           WHEN NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL THEN 'verified_quote_missing'
           WHEN c.cited_count=0 THEN 'cited_evidence_missing' END reason
    FROM candidates c
    WHERE c.match_id IS NULL OR c.lane_final IS NULL OR c.lane_final NOT IN ('act','write')
       OR NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL OR c.cited_count=0
  LOOP
    IF NOT EXISTS(SELECT 1 FROM ef_error_log WHERE function_name='oe_app_queue' AND user_id=v_uid AND context->>'opportunity_id'=v_bad.id::text AND created_at>=current_date) THEN
      INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context)
      VALUES('oe_app_queue',v_uid,'warn','Opportunity omitted from app queue because its reason was not grounded',jsonb_build_object('opportunity_id',v_bad.id,'lane',v_bad.lane_final,'reason',v_bad.reason));
    END IF;
  END LOOP;

  WITH latest_matches AS (
    SELECT DISTINCT ON(m.opportunity_id) m.* FROM oe_matches m WHERE m.user_id=v_uid ORDER BY m.opportunity_id,m.judged_at DESC
  ), valid AS (
    SELECT o.*,m.lane_final,m.scores,m.requirement_check,m.met_count,m.total_count,COALESCE(m.purpose,'explore') purpose,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face) FROM oe_faces f WHERE f.user_id=v_uid AND f.id IN (SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite WHERE cite->>'kind'='face') AND NULLIF(trim(f.summary),'') IS NOT NULL),'[]'::jsonb) evidence,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id) FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='rule' AND n.active AND n.ratified_at IS NOT NULL AND n.kind='hard' AND (m.lane_final='act' OR (n.field='sector' AND lower(COALESCE(o.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%') OR (n.field='place' AND (lower(COALESCE(o.location,'')) LIKE '%saudi%' OR lower(COALESCE(o.location,'')) LIKE '%riyadh%' OR lower(COALESCE(o.location,'')) LIKE '%ksa%')) OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(o.chair_type,''))<>lower(n.value)))),'[]'::jsonb) cleared_rules
    FROM oe_opportunities o JOIN latest_matches m ON m.opportunity_id=o.id
    WHERE o.alive AND m.lane_final IN ('act','write') AND o.quote_verified AND NULLIF(trim(o.evidence_quote),'') IS NOT NULL
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite JOIN oe_faces f ON f.id=CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END AND f.user_id=v_uid WHERE cite->>'kind'='face' AND NULLIF(trim(f.summary),'') IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
  ), ranked AS (
    SELECT v.*,row_number() OVER(PARTITION BY lane_final,purpose ORDER BY CASE WHEN lane_final='act' THEN deadline END ASC NULLS LAST,created_at DESC) purpose_rank,
      row_number() OVER(PARTITION BY lane_final ORDER BY CASE WHEN lane_final='act' THEN deadline END ASC NULLS LAST,created_at DESC) lane_rank
    FROM valid v
  ), interleaved AS (
    SELECT r.*,((r.purpose_rank-0.5)/GREATEST(COALESCE((v_weights->>r.purpose)::numeric,0.01),0.01)) interleave_rank
    FROM ranked r
  ), selected AS (
    SELECT i.* FROM interleaved i WHERE i.lane_final='act' OR i.lane_rank<=3
  )
  SELECT jsonb_build_object(
    'cards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'opportunity_id',q.id,'lane',q.lane_final,'purpose',q.purpose,'why_lines',q.evidence,'gap_line',CASE WHEN NULLIF(trim(q.scores->>'gap'),'') IS NULL THEN NULL ELSE jsonb_build_object('text',q.scores->>'gap') END,'quote',q.evidence_quote,'rule_ids',q.cleared_rules,'rule_count',jsonb_array_length(q.cleared_rules),'title',q.title,'chair_type',q.chair_type,'level_band',q.level_band,'sector',q.sector,'location',q.location,'scope',q.scope,'deadline',q.deadline,'source_url',q.source_url,'route_url',q.route_url,'route_kind',q.route_kind,'issuer_id',q.issuer_id,'issuer_name',e.name,'last_checked',q.last_seen_at) ORDER BY CASE WHEN q.lane_final='act' THEN 0 ELSE 1 END,q.interleave_rank,CASE WHEN q.lane_final='act' THEN q.deadline END ASC NULLS LAST,q.created_at DESC) FROM selected q LEFT JOIN oe_entities e ON e.id=q.issuer_id),'[]'::jsonb),
    'surface_count',(SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),'entity_count',(SELECT count(*) FROM oe_entities),
    'rule_count',(SELECT count(*) FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NOT NULL),'held_count',(SELECT count(*) FROM oe_suppressed WHERE user_id=v_uid AND day>=v_month),
    'direction',(SELECT to_jsonb(d) FROM oe_direction d WHERE d.user_id=v_uid),
    'rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind,n.stated_on DESC) FROM(SELECT id,kind,rule_text,rule_text_ar,field,op,value,stated_on,derived_from,ratified_at FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NOT NULL)n),'[]'::jsonb),
    'pending_rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.stated_on DESC) FROM(SELECT id,kind,rule_text,field,op,value,stated_on,derived_from FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NULL)n),'[]'::jsonb),
    'comments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'said_on',n.stated_on) ORDER BY n.stated_on DESC) FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='comment' AND n.active),'[]'::jsonb),
    'held',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'day',s.day,'reason',s.reason,'rank',s.rank,'opportunity_id',s.opportunity_id,'title',o.title) ORDER BY s.day DESC,s.rank) FROM oe_suppressed s LEFT JOIN oe_opportunities o ON o.id=s.opportunity_id WHERE s.user_id=v_uid AND s.day>=v_month),'[]'::jsonb),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'shown_at',x.shown_at,'lane',x.lane,'tap',x.tap,'signal_class',x.signal_class,'truth_code',x.truth_code,'outcome',x.outcome,'why',x.why,'title',o.title) ORDER BY x.shown_at DESC) FROM(SELECT * FROM oe_serves WHERE user_id=v_uid ORDER BY shown_at DESC LIMIT 60)x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id),'[]'::jsonb),
    'due_outcomes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',o.title)) FROM oe_serves x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id WHERE x.user_id=v_uid AND x.tap='right' AND x.outcome IS NULL AND x.tapped_at BETWEEN now()-interval '15 days' AND now()-interval '13 days'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $function$;
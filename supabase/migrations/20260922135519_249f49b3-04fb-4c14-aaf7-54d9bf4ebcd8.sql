-- The agency list is data, never a literal in a function body.
UPDATE public.oe_policy_versions
   SET params = params
     || jsonb_build_object('move_weight', 1.4)
     || jsonb_build_object('agency_issuers', to_jsonb(ARRAY[
          'michael page','page executive','pagegroup','hays','robert walters',
          'robert half','nadia','charterhouse','mena recruit','korn ferry','kornferry',
          'heidrick','spencer stuart','egon zehnder','adecco','manpower','hudson',
          'talent','recruitment','recruiters','staffing','headhunt'
        ]))
 WHERE active;

CREATE OR REPLACE FUNCTION public.oe_is_agency(p_issuer text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.oe_policy_versions pv,
         lateral jsonb_array_elements_text(coalesce(pv.params->'agency_issuers','[]'::jsonb)) a(name)
    where pv.active
      and nullif(trim(coalesce(p_issuer,'')),'') is not null
      and lower(p_issuer) like '%' || lower(a.name) || '%'
    limit 1
  );
$function$;
REVOKE ALL ON FUNCTION public.oe_is_agency(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_is_agency(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_queue_core()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_month date:=date_trunc('month',current_date)::date; v_result jsonb; v_bad record;
  v_mix text; v_weights jsonb; v_kinds text[]:=public.oe_card_kinds();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.oe_refresh_purpose(v_uid);
  SELECT COALESCE(d.mix,'win') INTO v_mix FROM oe_direction d WHERE d.user_id=v_uid;
  v_mix:=COALESCE(v_mix,'win');
  SELECT value->v_mix INTO v_weights FROM admin_settings WHERE key='oe_mix_weights';
  v_weights:=COALESCE(v_weights,'{"strength":0.70,"build":0.20,"explore":0.10}'::jsonb);

  -- An agency advert hides the employer: no named counterparty, no tier, no
  -- honest door. It is refused, and the refusal is written down.
  INSERT INTO oe_card_refusals(user_id,opportunity_id,card_date,reason,detail)
  SELECT v_uid,o.id,current_date,'agency_listing',o.issuer_raw
  FROM oe_opportunities o
  JOIN LATERAL (SELECT x.lane_final FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=v_uid ORDER BY x.judged_at DESC LIMIT 1) m ON true
  WHERE o.alive AND o.kind = ANY(v_kinds) AND m.lane_final='act' AND public.oe_is_agency(o.issuer_raw)
    AND NOT EXISTS(SELECT 1 FROM oe_card_refusals r WHERE r.user_id=v_uid AND r.opportunity_id=o.id AND r.card_date=current_date);

  FOR v_bad IN
    WITH candidates AS (
      SELECT o.id,m.lane_final,m.id match_id,COALESCE(jsonb_array_length(COALESCE(m.scores->'cites','[]'::jsonb)),0) cited_count,o.quote_verified,o.evidence_quote,COALESCE(m.eligibility_fail,'{}'::text[]) fails
      FROM oe_opportunities o LEFT JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=v_uid ORDER BY x.judged_at DESC LIMIT 1) m ON true
      WHERE o.alive AND o.kind = ANY(v_kinds) AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
    )
    SELECT c.id,c.lane_final,CASE WHEN c.match_id IS NULL THEN 'not_judged_for_this_member' WHEN c.lane_final IS DISTINCT FROM 'act' THEN 'no_act_lane' WHEN (NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL) AND c.cited_count=0 THEN 'quote_and_cite_missing' WHEN NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL THEN 'verified_quote_missing' WHEN c.cited_count=0 THEN 'cited_evidence_missing' END reason
    FROM candidates c WHERE NOT ('place'=ANY(c.fails)) AND (c.match_id IS NULL OR c.lane_final IS DISTINCT FROM 'act' OR NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL OR c.cited_count=0)
  LOOP
    IF NOT EXISTS(SELECT 1 FROM ef_error_log WHERE function_name='oe_app_queue' AND user_id=v_uid AND context->>'opportunity_id'=v_bad.id::text AND created_at>=current_date) THEN INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context) VALUES('oe_app_queue',v_uid,'warn','Opportunity omitted from app queue because its reason was not grounded',jsonb_build_object('opportunity_id',v_bad.id,'lane',v_bad.lane_final,'reason',v_bad.reason)); END IF;
  END LOOP;

  WITH latest_matches AS (SELECT DISTINCT ON(m.opportunity_id) m.* FROM oe_matches m WHERE m.user_id=v_uid ORDER BY m.opportunity_id,m.judged_at DESC),
  latest_serves AS (SELECT DISTINCT ON(s.opportunity_id) s.* FROM oe_serves s WHERE s.user_id=v_uid AND s.channel='app' ORDER BY s.opportunity_id,s.shown_at DESC,s.created_at DESC),
  valid AS (
    SELECT o.*,m.lane_final,m.scores,m.requirement_check,m.met_count,m.total_count,COALESCE(m.purpose,'explore') purpose,
      public.oe_goal_weight(v_uid,o.kind,m.level_direction,m.profession_relation,
        CASE WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(COALESCE(m.requirement_check,'[]'::jsonb))='array' THEN m.requirement_check ELSE '[]'::jsonb END) rc
                         WHERE rc->>'kind'='decision_rights' AND COALESCE((rc->>'met')::boolean,false)) THEN 'owns' END) goal_weight,
      public.oe_place_weight(v_uid,o.location,o.sector) place_weight,
      GREATEST(1.0 + 0.5*LEAST(COALESCE(m.met_count,0),4)::numeric
               + CASE WHEN COALESCE(array_length(m.presentation_evidence_ids,1),0) > 0 THEN 0.5 ELSE 0 END, 0.5) proof_weight,
      GREATEST(0.5, LEAST(1.5, 1.0 + COALESCE((m.interest->>'score')::numeric,0))) interest_weight,
      CASE WHEN COALESCE(m.level_direction,'unknown')='unknown' THEN 0.7 ELSE 1.0 END level_weight,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face) FROM oe_faces f WHERE f.user_id=v_uid AND f.id IN (SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id'~*'^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite WHERE cite->>'kind'='face') AND NULLIF(trim(f.summary),'') IS NOT NULL),'[]'::jsonb) evidence,
      -- A place rule clears a card only against the member's own chosen places.
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id) FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='rule' AND n.active AND n.ratified_at IS NOT NULL AND n.kind='hard' AND (m.lane_final='act' OR (n.field='sector' AND lower(COALESCE(o.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%') OR (n.field='place' AND public.oe_place_weight(v_uid,o.location,o.sector) >= 1.0) OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(o.chair_type,''))<>lower(n.value)))),'[]'::jsonb) cleared_rules,
      m.interest
    FROM oe_opportunities o JOIN latest_matches m ON m.opportunity_id=o.id LEFT JOIN latest_serves ls ON ls.opportunity_id=o.id
    WHERE o.alive AND o.kind = ANY(v_kinds) AND m.lane_final='act' AND o.quote_verified AND NULLIF(trim(o.evidence_quote),'') IS NOT NULL AND NOT ('place'=ANY(COALESCE(m.eligibility_fail,'{}'::text[])))
      AND NOT public.oe_is_agency(o.issuer_raw)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite JOIN oe_faces f ON f.id=CASE WHEN cite->>'kind'='face' AND cite->>'id'~*'^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END AND f.user_id=v_uid WHERE cite->>'kind'='face' AND NULLIF(trim(f.summary),'') IS NOT NULL)
      AND COALESCE(ls.tap,'')<>'later' AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
  ), ranked AS (SELECT v.*,row_number() OVER(PARTITION BY lane_final,purpose ORDER BY deadline ASC NULLS LAST,goal_weight DESC,created_at DESC) purpose_rank,row_number() OVER(PARTITION BY lane_final ORDER BY deadline ASC NULLS LAST,goal_weight DESC,created_at DESC) lane_rank FROM valid v),
  interleaved AS (SELECT r.*,((r.purpose_rank-0.5)/GREATEST(COALESCE((v_weights->>r.purpose)::numeric,0.01),0.01))/GREATEST(r.goal_weight*r.place_weight*r.proof_weight*r.interest_weight*r.level_weight,0.1) interleave_rank FROM ranked r), selected AS (SELECT i.* FROM interleaved i WHERE i.lane_final='act')
  SELECT jsonb_build_object(
    'cards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'opportunity_id',q.id,'lane',q.lane_final,'purpose',q.purpose,'why_lines',q.evidence,'gap_line',CASE WHEN NULLIF(trim(q.scores->>'gap'),'') IS NULL THEN NULL ELSE jsonb_build_object('text',q.scores->>'gap') END,'quote',q.evidence_quote,'rule_ids',q.cleared_rules,'rule_count',jsonb_array_length(q.cleared_rules),'title',q.title,'chair_type',q.chair_type,'level_band',q.level_band,'sector',q.sector,'location',q.location,'scope',q.scope,'deadline',q.deadline,'source_url',q.source_url,'route_url',q.route_url,'route_kind',q.route_kind,'issuer_id',q.issuer_id,'issuer_name',COALESCE(NULLIF(trim(q.issuer_raw),''),e.name),'last_checked',q.last_seen_at,'quote_verified_at',CASE WHEN q.quote_verified THEN q.quote_last_attempt_at END,'route_checked_at',q.route_checked_at,'goal_weight',q.goal_weight,'interest',q.interest) ORDER BY q.interleave_rank,q.deadline ASC NULLS LAST,q.created_at DESC) FROM selected q LEFT JOIN oe_entities e ON e.id=q.issuer_id),'[]'::jsonb),
    'parked',COALESCE((SELECT jsonb_agg(jsonb_build_object('opportunity_id',o.id,'title',o.title,'issuer_name',COALESCE(NULLIF(trim(o.issuer_raw),''),e.name),'location',o.location,'deadline',o.deadline,'parked_at',ls.tapped_at) ORDER BY ls.tapped_at DESC) FROM latest_serves ls JOIN oe_opportunities o ON o.id=ls.opportunity_id AND o.alive LEFT JOIN oe_entities e ON e.id=o.issuer_id WHERE ls.tap='later'),'[]'::jsonb),
    'surface_count',(SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),'entity_count',(SELECT count(*) FROM oe_entities),'rule_count',(SELECT count(*) FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NOT NULL),'held_count',(SELECT count(*) FROM oe_suppressed WHERE user_id=v_uid AND day>=v_month),
    'direction',(SELECT to_jsonb(d) FROM oe_direction d WHERE d.user_id=v_uid),
    'rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind,n.active DESC,n.stated_on DESC) FROM(SELECT id,kind,rule_text,rule_text_ar,field,op,value,stated_on,active,derived_from,ratified_at FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND ratified_at IS NOT NULL)n),'[]'::jsonb),
    'pending_rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.stated_on DESC) FROM(SELECT id,kind,rule_text,field,op,value,stated_on,derived_from FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NULL)n),'[]'::jsonb),
    'comments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar,'said_on',n.stated_on,'field',n.field,'value',n.value) ORDER BY n.stated_on DESC) FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='comment' AND n.active AND n.field IS NOT NULL),'[]'::jsonb),
    'held',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'day',s.day,'reason',s.reason,'rank',s.rank,'opportunity_id',s.opportunity_id,'title',o.title) ORDER BY s.day DESC,s.rank) FROM oe_suppressed s LEFT JOIN oe_opportunities o ON o.id=s.opportunity_id WHERE s.user_id=v_uid AND s.day>=v_month),'[]'::jsonb),
    'due_outcomes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',o.title)) FROM oe_serves x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id WHERE x.user_id=v_uid AND x.tap='right' AND x.outcome IS NULL AND x.tapped_at BETWEEN now()-interval '15 days' AND now()-interval '13 days'),'[]'::jsonb),
    'also_watching',(SELECT count(*) FROM oe_opportunities o JOIN oe_matches m ON m.opportunity_id=o.id AND m.user_id=v_uid WHERE o.alive AND m.screen_outcome='survivor' AND NOT (o.kind = ANY(v_kinds))),
    'also_watching_kinds',COALESCE((SELECT jsonb_agg(jsonb_build_object('kind',t.kind,'label',COALESCE(k.label_en,t.kind),'count',t.n) ORDER BY t.n DESC) FROM (SELECT o.kind, count(*) n FROM oe_opportunities o JOIN oe_matches m ON m.opportunity_id=o.id AND m.user_id=v_uid WHERE o.alive AND m.screen_outcome='survivor' AND NOT (o.kind = ANY(v_kinds)) GROUP BY o.kind) t LEFT JOIN oe_opportunity_kinds k ON k.code=t.kind),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $function$;
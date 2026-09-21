
alter view public.oe_job_health set (security_invoker = on);
revoke execute on function public.oe_goal_weight(uuid, text) from authenticated, anon;

-- The funnel now shows what has passed triage but has not been read.
create or replace view public.oe_coverage_funnel as
 WITH s AS (
         SELECT 1 AS ord, 'registered'::text AS stage, 'organisations known'::text AS note,
            ( SELECT count(*) FROM oe_entities) AS n
        UNION ALL
         SELECT 2, 'discovered'::text, 'have relevant surfaces'::text,
            ( SELECT count(DISTINCT oe_surfaces.entity_id) FROM oe_surfaces WHERE oe_surfaces.entity_id IS NOT NULL)
        UNION ALL
         SELECT 3, 'accessible'::text, 'surfaces we may and can read'::text,
            ( SELECT count(DISTINCT oe_surfaces.entity_id) FROM oe_surfaces WHERE oe_surfaces.terms_ok IS TRUE AND oe_surfaces.entity_id IS NOT NULL)
        UNION ALL
         SELECT 4, 'current'::text, 'checked within their own schedule'::text,
            ( SELECT count(DISTINCT oe_surfaces.entity_id) FROM oe_surfaces
               WHERE oe_surfaces.terms_ok IS TRUE AND oe_surfaces.entity_id IS NOT NULL AND oe_surfaces.last_harvested_at IS NOT NULL
                 AND oe_surfaces.last_harvested_at > (now() - CASE lower(COALESCE(oe_surfaces.cadence, 'weekly'::text))
                            WHEN 'daily'::text THEN '2 days'::interval WHEN 'weekly'::text THEN '9 days'::interval
                            WHEN 'monthly'::text THEN '35 days'::interval ELSE '14 days'::interval END))
        UNION ALL
         SELECT 5, 'passed_unread'::text, 'passed triage, still unread after 48 hours'::text,
            ( SELECT count(*) FROM oe_read_backlog)
        UNION ALL
         SELECT 6, 'productive'::text, 'produced a valid finding in 28 days'::text,
            ( SELECT count(DISTINCT o.issuer_id) FROM oe_opportunities o WHERE o.issuer_id IS NOT NULL AND o.first_seen_at > (now() - '28 days'::interval))
        UNION ALL
         SELECT 7, 'useful'::text, 'produced something a member acted on'::text,
            ( SELECT count(DISTINCT o.issuer_id) FROM oe_serves sv JOIN oe_opportunities o ON o.id = sv.opportunity_id WHERE sv.tap = 'right'::text AND o.issuer_id IS NOT NULL)
        UNION ALL
         SELECT 8, 'outside_target_market'::text, 'live records filtered before review because the market is not his'::text,
            ( SELECT count(*) FROM oe_opportunities o WHERE o.alive AND (COALESCE(oe_place_country(o.location), 'UNKNOWN'::text) <> ALL (ARRAY['SA','AE','QA','KW','BH','OM','UNSPECIFIED'])))
        )
 SELECT now() AS generated_at, ord AS stage_order, stage, note, n AS count FROM s ORDER BY ord;

CREATE OR REPLACE FUNCTION public.oe_app_queue_core()
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
      SELECT o.id,m.lane_final,m.id match_id,COALESCE(jsonb_array_length(COALESCE(m.scores->'cites','[]'::jsonb)),0) cited_count,o.quote_verified,o.evidence_quote,COALESCE(m.eligibility_fail,'{}'::text[]) fails
      FROM oe_opportunities o LEFT JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=v_uid ORDER BY x.judged_at DESC LIMIT 1) m ON true
      WHERE o.alive AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
    )
    SELECT c.id,c.lane_final,CASE WHEN c.match_id IS NULL THEN 'not_judged_for_this_member' WHEN c.lane_final IS NULL OR c.lane_final NOT IN ('act','write') THEN 'no_lane' WHEN (NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL) AND c.cited_count=0 THEN 'quote_and_cite_missing' WHEN NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL THEN 'verified_quote_missing' WHEN c.cited_count=0 THEN 'cited_evidence_missing' END reason
    FROM candidates c WHERE NOT ('place'=ANY(c.fails)) AND (c.match_id IS NULL OR c.lane_final IS NULL OR c.lane_final NOT IN ('act','write') OR NOT c.quote_verified OR NULLIF(trim(c.evidence_quote),'') IS NULL OR c.cited_count=0)
  LOOP
    IF NOT EXISTS(SELECT 1 FROM ef_error_log WHERE function_name='oe_app_queue' AND user_id=v_uid AND context->>'opportunity_id'=v_bad.id::text AND created_at>=current_date) THEN INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context) VALUES('oe_app_queue',v_uid,'warn','Opportunity omitted from app queue because its reason was not grounded',jsonb_build_object('opportunity_id',v_bad.id,'lane',v_bad.lane_final,'reason',v_bad.reason)); END IF;
  END LOOP;

  WITH latest_matches AS (SELECT DISTINCT ON(m.opportunity_id) m.* FROM oe_matches m WHERE m.user_id=v_uid ORDER BY m.opportunity_id,m.judged_at DESC),
  latest_serves AS (SELECT DISTINCT ON(s.opportunity_id) s.* FROM oe_serves s WHERE s.user_id=v_uid AND s.channel='app' ORDER BY s.opportunity_id,s.shown_at DESC,s.created_at DESC),
  valid AS (
    SELECT o.*,m.lane_final,m.scores,m.requirement_check,m.met_count,m.total_count,COALESCE(m.purpose,'explore') purpose,
      public.oe_goal_weight(v_uid,o.kind) goal_weight,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face) FROM oe_faces f WHERE f.user_id=v_uid AND f.id IN (SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id'~*'^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite WHERE cite->>'kind'='face') AND NULLIF(trim(f.summary),'') IS NOT NULL),'[]'::jsonb) evidence,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id) FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='rule' AND n.active AND n.ratified_at IS NOT NULL AND n.kind='hard' AND (m.lane_final='act' OR (n.field='sector' AND lower(COALESCE(o.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%') OR (n.field='place' AND (lower(COALESCE(o.location,'')) LIKE '%saudi%' OR lower(COALESCE(o.location,'')) LIKE '%riyadh%' OR lower(COALESCE(o.location,'')) LIKE '%ksa%')) OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(o.chair_type,''))<>lower(n.value)))),'[]'::jsonb) cleared_rules
    FROM oe_opportunities o JOIN latest_matches m ON m.opportunity_id=o.id LEFT JOIN latest_serves ls ON ls.opportunity_id=o.id
    WHERE o.alive AND m.lane_final IN ('act','write') AND o.quote_verified AND NULLIF(trim(o.evidence_quote),'') IS NOT NULL AND NOT ('place'=ANY(COALESCE(m.eligibility_fail,'{}'::text[])))
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite JOIN oe_faces f ON f.id=CASE WHEN cite->>'kind'='face' AND cite->>'id'~*'^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END AND f.user_id=v_uid WHERE cite->>'kind'='face' AND NULLIF(trim(f.summary),'') IS NOT NULL)
      AND COALESCE(ls.tap,'')<>'later' AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
  ), ranked AS (SELECT v.*,row_number() OVER(PARTITION BY lane_final,purpose ORDER BY CASE WHEN lane_final='act' THEN deadline END ASC NULLS LAST,goal_weight DESC,created_at DESC) purpose_rank,row_number() OVER(PARTITION BY lane_final ORDER BY CASE WHEN lane_final='act' THEN deadline END ASC NULLS LAST,goal_weight DESC,created_at DESC) lane_rank FROM valid v),
  interleaved AS (SELECT r.*,((r.purpose_rank-0.5)/GREATEST(COALESCE((v_weights->>r.purpose)::numeric,0.01),0.01))/GREATEST(r.goal_weight,0.25) interleave_rank FROM ranked r), selected AS (SELECT i.* FROM interleaved i WHERE i.lane_final='act' OR i.lane_rank<=3)
  SELECT jsonb_build_object(
    'cards',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'opportunity_id',q.id,'lane',q.lane_final,'purpose',q.purpose,'why_lines',q.evidence,'gap_line',CASE WHEN NULLIF(trim(q.scores->>'gap'),'') IS NULL THEN NULL ELSE jsonb_build_object('text',q.scores->>'gap') END,'quote',q.evidence_quote,'rule_ids',q.cleared_rules,'rule_count',jsonb_array_length(q.cleared_rules),'title',q.title,'chair_type',q.chair_type,'level_band',q.level_band,'sector',q.sector,'location',q.location,'scope',q.scope,'deadline',q.deadline,'source_url',q.source_url,'route_url',q.route_url,'route_kind',q.route_kind,'issuer_id',q.issuer_id,'issuer_name',e.name,'last_checked',q.last_seen_at,'quote_verified_at',CASE WHEN q.quote_verified THEN q.quote_last_attempt_at END,'route_checked_at',q.route_checked_at,'goal_weight',q.goal_weight) ORDER BY CASE WHEN q.lane_final='act' THEN 0 ELSE 1 END,q.interleave_rank,CASE WHEN q.lane_final='act' THEN q.deadline END ASC NULLS LAST,q.created_at DESC) FROM selected q LEFT JOIN oe_entities e ON e.id=q.issuer_id),'[]'::jsonb),
    'parked',COALESCE((SELECT jsonb_agg(jsonb_build_object('opportunity_id',o.id,'title',o.title,'issuer_name',e.name,'location',o.location,'deadline',o.deadline,'parked_at',ls.tapped_at) ORDER BY ls.tapped_at DESC) FROM latest_serves ls JOIN oe_opportunities o ON o.id=ls.opportunity_id AND o.alive LEFT JOIN oe_entities e ON e.id=o.issuer_id WHERE ls.tap='later'),'[]'::jsonb),
    'surface_count',(SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),'entity_count',(SELECT count(*) FROM oe_entities),'rule_count',(SELECT count(*) FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NOT NULL),'held_count',(SELECT count(*) FROM oe_suppressed WHERE user_id=v_uid AND day>=v_month),
    'direction',(SELECT to_jsonb(d) FROM oe_direction d WHERE d.user_id=v_uid),
    'rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind,n.active DESC,n.stated_on DESC) FROM(SELECT id,kind,rule_text,rule_text_ar,field,op,value,stated_on,active,derived_from,ratified_at FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND ratified_at IS NOT NULL)n),'[]'::jsonb),
    'pending_rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.stated_on DESC) FROM(SELECT id,kind,rule_text,field,op,value,stated_on,derived_from FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND active AND ratified_at IS NULL)n),'[]'::jsonb),
    'comments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'said_on',n.stated_on) ORDER BY n.stated_on DESC) FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='comment' AND n.active),'[]'::jsonb),
    'held',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'day',s.day,'reason',s.reason,'rank',s.rank,'opportunity_id',s.opportunity_id,'title',o.title) ORDER BY s.day DESC,s.rank) FROM oe_suppressed s LEFT JOIN oe_opportunities o ON o.id=s.opportunity_id WHERE s.user_id=v_uid AND s.day>=v_month),'[]'::jsonb),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('shown_at',x.shown_at,'lane',x.lane,'tap',x.tap,'tap_scope',x.tap_scope,'tap_scope_value',x.tap_scope_value,'tapped_at',x.tapped_at,'truth_code',x.truth_code,'outcome',x.outcome,'outcome_at',x.outcome_at,'title',o.title,'issuer_name',i.canonical_name,'location',o.location,'presentation_line',lm.presentation_line) ORDER BY x.shown_at DESC) FROM(SELECT * FROM oe_serves WHERE user_id=v_uid ORDER BY shown_at DESC LIMIT 60)x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id LEFT JOIN oe_issuers i ON i.id=o.issuer_id LEFT JOIN LATERAL(SELECT m.presentation_line FROM oe_matches m WHERE m.user_id=v_uid AND m.opportunity_id=o.id ORDER BY m.judged_at DESC LIMIT 1)lm ON true),'[]'::jsonb),
    'due_outcomes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',o.title)) FROM oe_serves x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id WHERE x.user_id=v_uid AND x.tap='right' AND x.outcome IS NULL AND x.tapped_at BETWEEN now()-interval '15 days' AND now()-interval '13 days'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $function$;

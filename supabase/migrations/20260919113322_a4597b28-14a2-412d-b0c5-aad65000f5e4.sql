-- ─────────────────────────────────────────────────────────────────────────
-- A) THE ACT LANE IS AN INTERSECTION, NOT A SYNONYM FOR ELIGIBLE.
-- Eligible AND gate_passed AND a live route. Anything else is not an act.
UPDATE public.oe_matches SET lane_final = 'write'
 WHERE lane_final = 'act'
   AND NOT (gate_passed IS TRUE AND lane = 'lane_open'
            AND eligibility_outcome IS DISTINCT FROM 'excluded');

ALTER TABLE public.oe_matches
  ADD CONSTRAINT oe_matches_act_is_intersection
  CHECK (lane_final IS DISTINCT FROM 'act'
         OR (gate_passed IS TRUE AND lane = 'lane_open'
             AND eligibility_outcome IS DISTINCT FROM 'excluded'));

-- B) A JUDGED MATCH MUST CARRY AN ACCESS VERDICT.
-- NOT VALID: four rows predate the profile-versus-requirement test and are
-- re-screened by the judge's stale sweep; the constraint is validated after.
ALTER TABLE public.oe_matches
  ADD CONSTRAINT oe_matches_judged_has_outcome
  CHECK (judged_at IS NULL OR eligibility_outcome IS NOT NULL) NOT VALID;

-- D) A COMMENT IS EVIDENCE OF INTENT AND IS NEVER EXECUTED.
UPDATE public.oe_notebook SET active = false
 WHERE entry_kind = 'comment' AND active;

ALTER TABLE public.oe_notebook
  ADD CONSTRAINT oe_notebook_comment_is_inert
  CHECK (entry_kind <> 'comment' OR (active = false AND ratified_at IS NULL));

-- D) Every reader of the notebook filters on a ratified rule, in SQL too.
CREATE OR REPLACE FUNCTION public.oe_app_render(p_card uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_opp oe_opportunities%ROWTYPE; v_match oe_matches%ROWTYPE;
  v_evidence jsonb; v_rules jsonb; v_why jsonb; v_serve uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_opp FROM oe_opportunities WHERE id=p_card AND alive;
  IF NOT FOUND THEN RAISE EXCEPTION 'opportunity unavailable'; END IF;
  SELECT * INTO v_match FROM oe_matches WHERE opportunity_id=p_card AND user_id=v_uid ORDER BY judged_at DESC LIMIT 1;
  IF v_match.id IS NULL OR COALESCE(v_match.lane_final,'') NOT IN ('act','write') THEN RAISE EXCEPTION 'opportunity unavailable'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face),'[]'::jsonb) INTO v_evidence
  FROM oe_faces f WHERE f.user_id=v_uid AND f.id IN (
    SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END FROM jsonb_array_elements(COALESCE(v_match.scores->'cites','[]'::jsonb)) cite
    WHERE cite->>'kind'='face'
  ) AND NULLIF(trim(f.summary),'') IS NOT NULL;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id),'[]'::jsonb) INTO v_rules
  FROM oe_notebook n WHERE n.user_id=v_uid AND n.active AND n.proposal_status='signed' AND n.kind='hard'
    AND n.entry_kind='rule' AND n.ratified_at IS NOT NULL
    AND (v_match.lane_final='act'
      OR (n.field='sector' AND lower(COALESCE(v_opp.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%')
      OR (n.field='place' AND (lower(COALESCE(v_opp.location,'')) LIKE '%saudi%' OR lower(COALESCE(v_opp.location,'')) LIKE '%riyadh%' OR lower(COALESCE(v_opp.location,'')) LIKE '%ksa%'))
      OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(v_opp.chair_type,''))<>lower(n.value))
      OR (n.op='exclude' AND n.field='level' AND lower(COALESCE(v_opp.level_band,''))<>lower(n.value)));
  IF NOT v_opp.quote_verified OR NULLIF(trim(v_opp.evidence_quote),'') IS NULL OR jsonb_array_length(v_evidence)=0 THEN
    INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context)
    VALUES('oe_app_render',v_uid,'warn','Opportunity render refused because its reason was not grounded',jsonb_build_object('opportunity_id',p_card,'verified_quote',v_opp.quote_verified,'evidence_count',jsonb_array_length(v_evidence)));
    RETURN jsonb_build_object('ok',false,'reason','ungrounded');
  END IF;
  v_why:=jsonb_build_object('summary',v_evidence->0->>'text','evidence',v_evidence,'risk',COALESCE(v_match.scores->>'gap',''),'rule_ids',v_rules,'rule_count',jsonb_array_length(v_rules),'quote',v_opp.evidence_quote,'source_url',v_opp.source_url,'last_verified_at',v_opp.last_seen_at);
  INSERT INTO oe_serves(user_id,card_id,opportunity_id,channel,lane,why)
  VALUES(v_uid,NULL,p_card,'app',v_match.lane_final,v_why) RETURNING id INTO v_serve;
  RETURN jsonb_build_object('ok',true,'serve_id',v_serve,'why',v_why);
END $function$;

CREATE OR REPLACE FUNCTION public.oe_app_proposal(p_id uuid, p_accept boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
 -- Accepting a proposal is the act of ratification, and it is dated.
 UPDATE oe_notebook SET proposal_status=CASE WHEN p_accept THEN 'signed' ELSE 'declined' END,
   origin=CASE WHEN p_accept THEN 'signed' ELSE origin END,
   active=p_accept, ratified_at=CASE WHEN p_accept THEN now() ELSE NULL END,
   expires_at=CASE WHEN p_accept THEN NULL ELSE now()+interval '90 days' END
 WHERE id=p_id AND user_id=auth.uid() AND proposal_status='open' AND entry_kind='rule';
END $function$;

CREATE OR REPLACE FUNCTION public.oe_app_show_anyway(p_suppressed uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid:=auth.uid(); v_row oe_suppressed%ROWTYPE;
BEGIN
 SELECT * INTO v_row FROM oe_suppressed WHERE id=p_suppressed AND user_id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'held item unavailable'; END IF;
 -- He asked for it in as many words, so it is a ratified rule, dated now.
 INSERT INTO oe_notebook(user_id,kind,rule_text,rule_text_ar,field,op,value,origin,proposal_status,proposed_because,expires_at,active,entry_kind,ratified_at)
 VALUES(v_uid,'soft','Show this kind again','أظهر لي هذا النوع مجدداً','requirement','prefer',v_row.reason,'stated','signed',jsonb_build_object('suppressed_id',p_suppressed),now()+interval '30 days',true,'rule',now());
END $function$;

CREATE OR REPLACE FUNCTION public.oe_app_decide(p_card uuid, p_action text, p_scope text DEFAULT NULL::text, p_scope_value text DEFAULT NULL::text, p_truth text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    ELSIF p_truth='quote_absent' THEN UPDATE oe_opportunities SET quote_verified=false, quote_fail_reason='quote_absent', quote_fail_detail='reported by a member', quote_last_attempt_at=now() WHERE id=p_card;
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
    IF v_count>=3 AND NOT EXISTS(SELECT 1 FROM oe_notebook WHERE user_id=v_uid AND entry_kind='rule' AND field=p_scope AND value=p_scope_value AND (active OR expires_at>now())) THEN
      INSERT INTO oe_notebook(user_id,kind,rule_text,rule_text_ar,field,op,value,origin,proposal_status,proposed_because,active,entry_kind)
      VALUES(v_uid,'soft','Stop showing '||p_scope_value,'أوقف عرض '||p_scope_value,
        CASE p_scope WHEN 'type' THEN 'chair_type' WHEN 'level' THEN 'level' WHEN 'place' THEN 'place' WHEN 'issuer' THEN 'issuer' WHEN 'sector' THEN 'sector' ELSE NULL END,
        'exclude',p_scope_value,'stated','open',jsonb_build_object('declines_30d',v_count,'scope',p_scope),true,'rule') RETURNING id INTO v_proposal;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'proposal_id',v_proposal,'declines',v_count);
END $function$;

-- ─────────────────────────────────────────────────────────────────────────
-- E) AN UNVERIFIED QUOTE IS QUEUED, NEVER SILENTLY ABANDONED.
-- The grounding rule does not move: a card without a verified quote still
-- does not render. What changes is that failure is now a state with a
-- counter, a clock and a named cause, not a terminal flag.
ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS quote_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_fail_reason text,
  ADD COLUMN IF NOT EXISTS quote_fail_detail text,
  ADD COLUMN IF NOT EXISTS quote_abandoned boolean NOT NULL DEFAULT false;

ALTER TABLE public.oe_opportunities
  ADD CONSTRAINT oe_quote_fail_reason_known
  CHECK (quote_fail_reason IS NULL
         OR quote_fail_reason IN ('fetch_failed','page_changed','quote_absent'));

-- Due for another look: backoff of 1h, 4h, 16h, then abandoned at 3 attempts.
CREATE OR REPLACE FUNCTION public.oe_quote_recheck_due(p_limit integer DEFAULT 20, p_max_attempts integer DEFAULT 3)
 RETURNS TABLE(id uuid, source_url text, evidence_quote text, content_hash text, quote_attempts integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT o.id, o.source_url, o.evidence_quote, o.content_hash, o.quote_attempts
  FROM oe_opportunities o
  WHERE o.alive
    AND o.quote_verified IS NOT TRUE
    AND NULLIF(trim(o.evidence_quote),'') IS NOT NULL
    AND NULLIF(trim(o.source_url),'') IS NOT NULL
    AND o.quote_abandoned = false
    AND o.quote_attempts < p_max_attempts
    AND (o.quote_last_attempt_at IS NULL
         OR o.quote_last_attempt_at < now() - (interval '1 hour' * power(4, o.quote_attempts)))
  ORDER BY o.quote_last_attempt_at NULLS FIRST, o.first_seen_at DESC
  LIMIT p_limit
$function$;

REVOKE ALL ON FUNCTION public.oe_quote_recheck_due(integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_quote_recheck_due(integer,integer) TO service_role;
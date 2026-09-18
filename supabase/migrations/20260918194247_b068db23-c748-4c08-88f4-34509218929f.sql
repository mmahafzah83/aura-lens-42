CREATE TABLE public.oe_direction (
  user_id uuid PRIMARY KEY,
  priority text CHECK (priority IN ('bigger_seat','known_for_one','new_rooms','out_of_sector','stay_current')),
  priority_set_on date,
  priority_expires_at date,
  mix text CHECK (mix IN ('win','build','explore')),
  mix_set_on date,
  ambition_text text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oe_direction TO authenticated;
GRANT ALL ON public.oe_direction TO service_role;
ALTER TABLE public.oe_direction ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read their direction" ON public.oe_direction FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY "Members create their direction" ON public.oe_direction FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
CREATE POLICY "Members update their direction" ON public.oe_direction FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "Members delete their direction" ON public.oe_direction FOR DELETE TO authenticated USING (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.oe_direction_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
CREATE TRIGGER oe_direction_touch_before_update BEFORE UPDATE ON public.oe_direction FOR EACH ROW EXECUTE FUNCTION public.oe_direction_touch();

ALTER TABLE public.oe_matches ADD COLUMN purpose text;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_purpose_check CHECK (purpose IN ('strength','build','explore'));

INSERT INTO public.admin_settings(key,value) VALUES
('oe_mix_weights', '{"win":{"strength":0.70,"build":0.20,"explore":0.10},"build":{"strength":0.30,"build":0.60,"explore":0.10},"explore":{"strength":0.30,"build":0.30,"explore":0.40}}'::jsonb)
ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now();

CREATE OR REPLACE FUNCTION public.oe_normalize_terms(p_text text)
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token),'{}'::text[])
  FROM regexp_split_to_table(lower(regexp_replace(COALESCE(p_text,''),'[^[:alnum:]\p{Arabic}]+',' ','g')), '\s+') token
  WHERE length(token)>=4 AND token NOT IN ('with','from','that','this','have','will','your','into','about','their','where','which','required','requirements','experience','years','role','work','team','على','إلى','التي','الذي','هذه','هذا','خبرة','سنوات');
$$;

CREATE OR REPLACE FUNCTION public.oe_refresh_purpose(p_user uuid)
RETURNS TABLE(opportunity_id uuid,purpose text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_priority text;
  v_core text[];
  v_level text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()<>p_user AND NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT d.priority INTO v_priority FROM oe_direction d WHERE d.user_id=p_user;
  v_priority:=COALESCE(v_priority,'bigger_seat');
  SELECT COALESCE(e.sectors_core,'{}'::text[]),e.level_now INTO v_core,v_level FROM oe_eligibility e WHERE e.user_id=p_user;

  WITH latest AS (
    SELECT DISTINCT ON (m.opportunity_id) m.id,m.opportunity_id,m.scores
    FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
    WHERE m.user_id=p_user AND o.alive
    ORDER BY m.opportunity_id,m.judged_at DESC
  ), facts AS (
    SELECT l.id,l.opportunity_id,o.chair_type,o.discovery_kind,o.sector,o.level_band,o.requirements,
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(v_core,'{}'::text[])) s
        WHERE replace(lower(COALESCE(o.sector,'')),' ','_') LIKE '%'||lower(s)||'%'
           OR lower(s) LIKE '%'||replace(lower(COALESCE(o.sector,'')),' ','_')||'%'
      ) AS core_sector,
      COALESCE((SELECT array_agg(DISTINCT term) FROM (
        SELECT unnest(public.oe_normalize_terms(f.summary||' '||array_to_string(f.keywords,' '))) term
        FROM jsonb_array_elements(COALESCE(l.scores->'cites','[]'::jsonb)) c
        JOIN oe_faces f ON f.user_id=p_user AND f.id=CASE WHEN c->>'kind'='face' AND c->>'id' ~* '^[0-9a-f-]{36}$' THEN (c->>'id')::uuid END
      ) z),'{}'::text[]) AS evidence_terms,
      public.oe_normalize_terms(o.requirements::text) AS requirement_terms
    FROM latest l JOIN oe_opportunities o ON o.id=l.opportunity_id
  ), classified AS (
    SELECT f.*,
      CASE
        WHEN f.core_sector OR cardinality(ARRAY(SELECT unnest(f.evidence_terms) INTERSECT SELECT unnest(f.requirement_terms)))>=2 THEN 'strength'
        WHEN v_priority='bigger_seat' AND f.level_band=(CASE v_level WHEN 'ic' THEN 'manager' WHEN 'manager' THEN 'senior_manager' WHEN 'senior_manager' THEN 'director' WHEN 'director' THEN 'senior_director' WHEN 'senior_director' THEN 'vp' WHEN 'vp' THEN 'c_suite' WHEN 'c_suite' THEN 'board' END) THEN 'build'
        WHEN v_priority='known_for_one' AND f.chair_type IN ('speaking','media','learning') THEN 'build'
        WHEN v_priority='new_rooms' AND (f.chair_type IN ('room','advisory') OR f.discovery_kind='corporate_event_inference') THEN 'build'
        WHEN v_priority='out_of_sector' AND NOT f.core_sector THEN 'build'
        ELSE 'explore'
      END AS new_purpose
    FROM facts f
  )
  UPDATE oe_matches m SET purpose=c.new_purpose
  FROM classified c WHERE m.id=c.id AND m.purpose IS DISTINCT FROM c.new_purpose;

  RETURN QUERY SELECT m.opportunity_id,m.purpose FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
    WHERE m.user_id=p_user AND o.alive AND m.judged_at=(SELECT max(x.judged_at) FROM oe_matches x WHERE x.user_id=p_user AND x.opportunity_id=m.opportunity_id)
    ORDER BY m.opportunity_id;
END $$;
REVOKE ALL ON FUNCTION public.oe_refresh_purpose(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_refresh_purpose(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_direction_save(p_priority text DEFAULT NULL,p_mix text DEFAULT NULL,p_defer boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_row oe_direction%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('bigger_seat','known_for_one','new_rooms','out_of_sector','stay_current') THEN RAISE EXCEPTION 'unknown priority'; END IF;
  IF p_mix IS NOT NULL AND p_mix NOT IN ('win','build','explore') THEN RAISE EXCEPTION 'unknown mix'; END IF;
  INSERT INTO oe_direction(user_id,priority,priority_set_on,priority_expires_at,mix,mix_set_on)
  VALUES(v_uid,p_priority,CASE WHEN p_priority IS NOT NULL THEN current_date END,
    CASE WHEN p_priority IS NOT NULL THEN current_date+90 WHEN p_defer THEN current_date+7 END,
    p_mix,CASE WHEN p_mix IS NOT NULL THEN current_date END)
  ON CONFLICT(user_id) DO UPDATE SET
    priority=COALESCE(EXCLUDED.priority,oe_direction.priority),
    priority_set_on=CASE WHEN EXCLUDED.priority IS NOT NULL THEN current_date ELSE oe_direction.priority_set_on END,
    priority_expires_at=CASE WHEN EXCLUDED.priority IS NOT NULL THEN current_date+90 WHEN p_defer THEN current_date+7 ELSE oe_direction.priority_expires_at END,
    mix=COALESCE(EXCLUDED.mix,oe_direction.mix),
    mix_set_on=CASE WHEN EXCLUDED.mix IS NOT NULL THEN current_date ELSE oe_direction.mix_set_on END,
    updated_at=now()
  RETURNING * INTO v_row;
  PERFORM public.oe_refresh_purpose(v_uid);
  RETURN to_jsonb(v_row);
END $$;
REVOKE ALL ON FUNCTION public.oe_direction_save(text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_direction_save(text,text,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
      SELECT o.id,o.lane_final,m.id match_id,COALESCE(jsonb_array_length(COALESCE(m.scores->'cites','[]'::jsonb)),0) cited_count
      FROM oe_opportunities o LEFT JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=v_uid ORDER BY x.judged_at DESC LIMIT 1) m ON true
      WHERE o.alive AND o.lane_final IN ('act','write') AND NOT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.opportunity_id=o.id AND s.tap IS NOT NULL AND s.tap<>'later')
    )
    SELECT c.id,c.lane_final,CASE WHEN NOT o.quote_verified OR NULLIF(trim(o.evidence_quote),'') IS NULL THEN 'verified_quote_missing' WHEN c.match_id IS NULL OR c.cited_count=0 THEN 'cited_evidence_missing' END reason
    FROM candidates c JOIN oe_opportunities o ON o.id=c.id
    WHERE NOT o.quote_verified OR NULLIF(trim(o.evidence_quote),'') IS NULL OR c.match_id IS NULL OR c.cited_count=0
  LOOP
    IF NOT EXISTS(SELECT 1 FROM ef_error_log WHERE function_name='oe_app_queue' AND user_id=v_uid AND context->>'opportunity_id'=v_bad.id::text AND created_at>=current_date) THEN
      INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context) VALUES('oe_app_queue',v_uid,'error','Opportunity omitted from app queue because its reason was not grounded',jsonb_build_object('opportunity_id',v_bad.id,'lane',v_bad.lane_final,'reason',v_bad.reason));
    END IF;
  END LOOP;

  WITH latest_matches AS (
    SELECT DISTINCT ON(m.opportunity_id) m.* FROM oe_matches m WHERE m.user_id=v_uid ORDER BY m.opportunity_id,m.judged_at DESC
  ), valid AS (
    SELECT o.*,m.scores,m.requirement_check,m.met_count,m.total_count,COALESCE(m.purpose,'explore') purpose,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'text',f.summary,'face',f.face) ORDER BY f.face) FROM oe_faces f WHERE f.user_id=v_uid AND f.id IN (SELECT CASE WHEN cite->>'kind'='face' AND cite->>'id' ~* '^[0-9a-f-]{36}$' THEN (cite->>'id')::uuid END FROM jsonb_array_elements(COALESCE(m.scores->'cites','[]'::jsonb)) cite WHERE cite->>'kind'='face') AND NULLIF(trim(f.summary),'') IS NOT NULL),'[]'::jsonb) evidence,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar) ORDER BY n.stated_on,n.id) FROM oe_notebook n WHERE n.user_id=v_uid AND n.active AND n.proposal_status='signed' AND n.kind='hard' AND (o.lane_final='act' OR (n.field='sector' AND lower(COALESCE(o.sector,'')) LIKE '%'||replace(lower(n.value),'_','%')||'%') OR (n.field='place' AND (lower(COALESCE(o.location,'')) LIKE '%saudi%' OR lower(COALESCE(o.location,'')) LIKE '%riyadh%' OR lower(COALESCE(o.location,'')) LIKE '%ksa%')) OR (n.op='exclude' AND n.field='chair_type' AND lower(COALESCE(o.chair_type,''))<>lower(n.value)) OR (n.op='exclude' AND n.field='level' AND lower(COALESCE(o.level_band,''))<>lower(n.value)))),'[]'::jsonb) cleared_rules
    FROM oe_opportunities o JOIN latest_matches m ON m.opportunity_id=o.id
    WHERE o.alive AND o.lane_final IN ('act','write') AND o.quote_verified AND NULLIF(trim(o.evidence_quote),'') IS NOT NULL
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
    'rule_count',(SELECT count(*) FROM oe_notebook WHERE user_id=v_uid AND active AND proposal_status='signed'),'held_count',(SELECT count(*) FROM oe_suppressed WHERE user_id=v_uid AND day>=v_month),
    'direction',(SELECT to_jsonb(d) FROM oe_direction d WHERE d.user_id=v_uid),
    'rules',COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind,n.stated_on DESC) FROM(SELECT id,kind,rule_text,rule_text_ar,field,op,value,stated_on FROM oe_notebook WHERE user_id=v_uid AND active AND proposal_status='signed')n),'[]'::jsonb),
    'held',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',s.id,'day',s.day,'reason',s.reason,'rank',s.rank,'opportunity_id',s.opportunity_id,'title',o.title) ORDER BY s.day DESC,s.rank) FROM oe_suppressed s LEFT JOIN oe_opportunities o ON o.id=s.opportunity_id WHERE s.user_id=v_uid AND s.day>=v_month),'[]'::jsonb),
    'history',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'shown_at',x.shown_at,'lane',x.lane,'tap',x.tap,'signal_class',x.signal_class,'truth_code',x.truth_code,'outcome',x.outcome,'why',x.why,'title',o.title) ORDER BY x.shown_at DESC) FROM(SELECT * FROM oe_serves WHERE user_id=v_uid ORDER BY shown_at DESC LIMIT 60)x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id),'[]'::jsonb),
    'due_outcomes',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'title',o.title)) FROM oe_serves x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id WHERE x.user_id=v_uid AND x.tap='right' AND x.outcome IS NULL AND x.tapped_at BETWEEN now()-interval '15 days' AND now()-interval '13 days'),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.oe_app_queue() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.oe_app_queue() TO authenticated,service_role;

INSERT INTO public.oe_vocabulary(key,kind,en,ar) VALUES
('priority_bigger_seat','label','A bigger seat','مقعد أكبر'),
('priority_bigger_seat_sub','label','a role, mandate or seat above where I am now','دور أو تكليف أو مقعد أعلى من موقعي الآن'),
('priority_known_for_one','label','Known for one subject','أن أُعرف بموضوع واحد'),
('priority_known_for_one_sub','label','to be the name people think of on one topic','أن أكون الاسم الذي يتبادر إلى الناس في موضوع واحد'),
('priority_new_rooms','label','Into rooms I''m not in','غرف لم أدخلها بعد'),
('priority_new_rooms_sub','label','panels, committees, closed tables','منصات ولجان وطاولات مغلقة'),
('priority_out_of_sector','label','Outside my sector','خارج قطاعي'),
('priority_out_of_sector_sub','label','work next to what I do now, not more of it','عمل يجاور ما أفعله الآن، لا مزيد منه'),
('priority_stay_current','label','Just keep me current','ابقني على اطّلاع'),
('priority_stay_current_sub','label','nothing to chase — don''t let me miss anything','لا شيء أطارده — فقط لا تدع شيئاً يفوتني'),
('mix_win','label','What I can win now','ما يمكنني كسبه الآن'),
('mix_build','label','What moves me toward it','ما يقرّبني من هدفي'),
('mix_explore','label','What I haven''t considered','ما لم أفكّر فيه'),
('direction_priority_question','label','What would you like to happen in the next ninety days?','ما الذي تريد أن يحدث خلال التسعين يوماً القادمة؟'),
('direction_priority_renew','label','Still the same for the next ninety days?','هل ما زال هذا ما تريده للتسعين يوماً القادمة؟'),
('direction_mix_question','label','What should reach you most often right now?','ما الذي تريد أن يصلك أكثر الآن؟'),
('direction_not_now','action','Not now','ليس الآن'),
('direction_change','action','Change','تغيير'),
('direction_priority_sentence','label','For the next ninety days: {priority}. Set {date}.','للتسعين يوماً القادمة: {priority}. حُدّد في {date}.'),
('direction_mix_sentence','label','Right now you want: {mix}.','ما تريده الآن: {mix}.'),
('purpose_explore','label','Outside your usual','خارج المعتاد')
ON CONFLICT(key) DO UPDATE SET kind=EXCLUDED.kind,en=EXCLUDED.en,ar=EXCLUDED.ar,updated_at=now();
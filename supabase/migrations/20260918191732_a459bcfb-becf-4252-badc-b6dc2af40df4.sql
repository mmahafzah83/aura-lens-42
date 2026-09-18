CREATE OR REPLACE FUNCTION public.oe_app_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := current_date;
  v_month date := date_trunc('month', current_date)::date;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  SELECT jsonb_build_object(
    'cards', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'opportunity_id', c.opportunity_id, 'card_date', c.card_date,
        'lane', CASE WHEN c.lane IN ('act','lane_open') THEN 'act' ELSE 'write' END,
        'why_lines', c.why_lines, 'gap_line', c.gap_line, 'quote', c.quote,
        'clock_text', c.clock_text, 'tap_token', c.tap_token, 'cited_ids', c.cited_ids,
        'title', o.title, 'chair_type', o.chair_type, 'location', o.location,
        'scope', o.scope, 'deadline', o.deadline, 'source_url', o.source_url,
        'route_url', o.route_url, 'route_kind', o.route_kind,
        'issuer_id', o.issuer_id, 'issuer_name', e.name,
        'last_checked', o.last_seen_at
      ) ORDER BY CASE WHEN c.lane IN ('act','lane_open') THEN 0 ELSE 1 END, c.created_at DESC)
      FROM oe_cards c
      LEFT JOIN oe_opportunities o ON o.id = c.opportunity_id
      LEFT JOIN oe_entities e ON e.id = o.issuer_id
      WHERE c.user_id = v_uid AND c.card_date = v_today
        AND c.opportunity_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM oe_taps t WHERE t.card_id = c.id)
    ), '[]'::jsonb),
    'surface_count', (SELECT count(*) FROM oe_surfaces WHERE terms_ok IS TRUE),
    'entity_count', (SELECT count(*) FROM oe_entities),
    'rule_count', (SELECT count(*) FROM oe_notebook WHERE user_id = v_uid AND active AND proposal_status = 'signed'),
    'held_count', (SELECT count(*) FROM oe_suppressed WHERE user_id = v_uid AND day >= v_month),
    'rules', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.kind, n.stated_on DESC) FROM (
      SELECT id, kind, rule_text, rule_text_ar, field, op, value, stated_on
      FROM oe_notebook WHERE user_id = v_uid AND active AND proposal_status = 'signed'
    ) n), '[]'::jsonb),
    'held', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', s.id, 'day', s.day, 'reason', s.reason, 'rank', s.rank,
      'opportunity_id', s.opportunity_id, 'title', o.title
    ) ORDER BY s.day DESC, s.rank) FROM oe_suppressed s
      LEFT JOIN oe_opportunities o ON o.id = s.opportunity_id
      WHERE s.user_id = v_uid AND s.day >= v_month), '[]'::jsonb),
    'history', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', x.id, 'shown_at', x.shown_at, 'lane', x.lane, 'tap', x.tap,
      'signal_class', x.signal_class, 'truth_code', x.truth_code,
      'outcome', x.outcome, 'why', x.why, 'title', o.title
    ) ORDER BY x.shown_at DESC) FROM (
      SELECT * FROM oe_serves WHERE user_id = v_uid ORDER BY shown_at DESC LIMIT 60
    ) x LEFT JOIN oe_opportunities o ON o.id = x.opportunity_id), '[]'::jsonb),
    'due_outcomes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'title', o.title))
      FROM oe_serves x LEFT JOIN oe_opportunities o ON o.id=x.opportunity_id
      WHERE x.user_id=v_uid AND x.tap='right' AND x.outcome IS NULL
        AND x.tapped_at BETWEEN now()-interval '15 days' AND now()-interval '13 days'), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.oe_app_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_app_queue() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_render(p_card uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid:=auth.uid(); v_card oe_cards%ROWTYPE; v_why jsonb;
BEGIN
  SELECT * INTO v_card FROM oe_cards WHERE id=p_card AND user_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'card unavailable'; END IF;
  v_why := jsonb_build_object(
    'summary', COALESCE(v_card.why_lines->0->>'text',''),
    'evidence', COALESCE(v_card.why_lines,'[]'::jsonb),
    'risk', COALESCE(v_card.gap_line,'{}'::jsonb),
    'rules', COALESCE(v_card.cited_ids,'[]'::jsonb),
    'gate', 'pass'
  );
  IF length(trim(COALESCE(v_why->>'summary',''))) = 0 THEN
    INSERT INTO ef_error_log(function_name,user_id,severity,error_message,context)
    VALUES ('oe_app_render',v_uid,'error','Opportunity card had no member-facing reason',jsonb_build_object('card_id',p_card));
    RETURN jsonb_build_object('ok',false,'reason','empty_why');
  END IF;
  INSERT INTO oe_serves(user_id,card_id,opportunity_id,channel,lane,why)
  VALUES(v_uid,v_card.id,v_card.opportunity_id,'app',CASE WHEN v_card.lane IN ('act','lane_open') THEN 'act' ELSE 'write' END,v_why)
  ON CONFLICT(card_id) DO UPDATE SET channel='app', why=EXCLUDED.why, updated_at=now();
  RETURN jsonb_build_object('ok',true,'why',v_why);
END $$;
REVOKE ALL ON FUNCTION public.oe_app_render(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_app_render(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_decide(p_card uuid,p_action text,p_scope text DEFAULT NULL,p_scope_value text DEFAULT NULL,p_truth text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE v_uid uuid:=auth.uid(); v_card oe_cards%ROWTYPE; v_count int:=0; v_proposal uuid; v_opp oe_opportunities%ROWTYPE;
BEGIN
  IF p_action NOT IN ('right','not_quite','later') THEN RAISE EXCEPTION 'unknown decision'; END IF;
  SELECT * INTO v_card FROM oe_cards WHERE id=p_card AND user_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'card unavailable'; END IF;
  IF p_action='later' THEN RETURN jsonb_build_object('ok',true,'later',true); END IF;
  IF p_truth IS NOT NULL THEN
    IF p_truth NOT IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer') THEN RAISE EXCEPTION 'unknown truth'; END IF;
    UPDATE oe_serves SET tap='not_my_area',tapped_at=now(),signal_class='truth',truth_code=p_truth,updated_at=now() WHERE card_id=p_card AND user_id=v_uid;
    SELECT * INTO v_opp FROM oe_opportunities WHERE id=v_card.opportunity_id;
    IF p_truth='dead_route' THEN UPDATE oe_opportunities SET route_dead=true WHERE id=v_card.opportunity_id;
    ELSIF p_truth='quote_absent' THEN UPDATE oe_opportunities SET quote_verified=false WHERE id=v_card.opportunity_id;
    ELSE UPDATE oe_opportunities SET alive=false WHERE id=v_card.opportunity_id; END IF;
    INSERT INTO oe_world_facts(kind,payload,evidence_url,confidence)
    VALUES(CASE WHEN p_truth='listing_page' THEN 'aggregator_fingerprint' WHEN p_truth='already_happened' THEN 'recurring_event' ELSE 'route_pattern' END,
      jsonb_build_object('code',p_truth,'opportunity_id',v_card.opportunity_id,'feed_id',v_opp.feed_id),COALESCE(v_opp.route_url,v_opp.source_url),0.8);
    RETURN jsonb_build_object('ok',true);
  END IF;
  UPDATE oe_serves SET tap=CASE WHEN p_action='right' THEN 'right' ELSE 'not_my_area' END,tapped_at=now(),
    tap_scope=p_scope,tap_scope_value=p_scope_value,signal_class=CASE WHEN p_action='not_quite' THEN 'taste' END,
    pursued=CASE WHEN p_action='right' THEN true ELSE pursued END,pursued_at=CASE WHEN p_action='right' THEN now() ELSE pursued_at END,updated_at=now()
  WHERE card_id=p_card AND user_id=v_uid;
  INSERT INTO oe_taps(user_id,card_id,tap,scope,scope_value,source,applied_at)
  VALUES(v_uid,p_card,CASE WHEN p_action='right' THEN 'right' ELSE 'not_my_area' END,p_scope,p_scope_value,'inapp',NULL)
  ON CONFLICT(card_id,tap) DO UPDATE SET scope=EXCLUDED.scope,scope_value=EXCLUDED.scope_value,tapped_at=now(),applied_at=NULL;
  IF p_action='not_quite' AND p_scope IS NOT NULL AND p_scope_value IS NOT NULL AND p_scope<>'just_this' THEN
    SELECT count(*) INTO v_count FROM oe_serves WHERE user_id=v_uid AND signal_class='taste' AND tap_scope=p_scope AND tap_scope_value=p_scope_value AND tapped_at>=now()-interval '30 days';
    IF v_count>=3 AND NOT EXISTS(SELECT 1 FROM oe_notebook WHERE user_id=v_uid AND field=p_scope AND value=p_scope_value AND (active OR expires_at>now())) THEN
      INSERT INTO oe_notebook(user_id,kind,rule_text,rule_text_ar,field,op,value,origin,proposal_status,proposed_because,active)
      VALUES(v_uid,'soft','Stop showing '||p_scope_value,'أوقف عرض '||p_scope_value,
        CASE p_scope WHEN 'type' THEN 'chair_type' WHEN 'level' THEN 'level' WHEN 'place' THEN 'place' WHEN 'issuer' THEN 'issuer' ELSE NULL END,
        'exclude',p_scope_value,'stated','open',jsonb_build_object('declines_30d',v_count,'scope',p_scope),true)
      RETURNING id INTO v_proposal;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true,'proposal_id',v_proposal,'declines',v_count);
END $$;
REVOKE ALL ON FUNCTION public.oe_app_decide(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_app_decide(uuid,text,text,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_proposal(p_id uuid,p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 UPDATE oe_notebook SET proposal_status=CASE WHEN p_accept THEN 'signed' ELSE 'declined' END,
   active=p_accept, expires_at=CASE WHEN p_accept THEN NULL ELSE now()+interval '90 days' END
 WHERE id=p_id AND user_id=auth.uid() AND proposal_status='open';
END $$;
REVOKE ALL ON FUNCTION public.oe_app_proposal(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_app_proposal(uuid,boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.oe_app_show_anyway(p_suppressed uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid:=auth.uid(); v_row oe_suppressed%ROWTYPE;
BEGIN
 SELECT * INTO v_row FROM oe_suppressed WHERE id=p_suppressed AND user_id=v_uid;
 IF NOT FOUND THEN RAISE EXCEPTION 'held item unavailable'; END IF;
 INSERT INTO oe_notebook(user_id,kind,rule_text,rule_text_ar,field,op,value,origin,proposal_status,proposed_because,expires_at,active)
 VALUES(v_uid,'soft','Show this kind again','أظهر لي هذا النوع مجدداً','requirement','prefer',v_row.reason,'stated','signed',jsonb_build_object('suppressed_id',p_suppressed),now()+interval '30 days',true);
END $$;
REVOKE ALL ON FUNCTION public.oe_app_show_anyway(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_app_show_anyway(uuid) TO authenticated, service_role;

INSERT INTO public.oe_vocabulary(key,kind,en,ar) VALUES
('queue_nav','label','Opportunities','الفرص'),
('queue_morning','label','Morning','صباح الخير'),
('queue_things_today','label','things today. About a minute.','أشياء اليوم. نحو دقيقة.'),
('queue_nothing_today','label','Nothing today.','لا شيء اليوم.'),
('queue_still_reading','label','Still reading','ما زلنا نقرأ'),
('queue_sources_across','label','sources across','مصادر لدى'),
('queue_organisations_next','label','organisations · next at 07:00','جهات · الجولة التالية 07:00'),
('queue_tuning_title','label','What reaches you','ما يصلك'),
('queue_rules_force','label','rules in force','قواعد سارية'),
('queue_held_month','label','held back this month','محجوبة هذا الشهر'),
('queue_after_this','label','After this','بعد ذلك'),
('queue_open_now','label','Open now','متاحة الآن'),
('queue_worth_writing','label','Worth writing about','جديرة بالكتابة'),
('queue_why_you','label','Why you','لماذا أنت'),
('queue_your_angle','label','Your angle','زاويتك'),
('queue_more','label','More','المزيد'),
('queue_less','label','Less','أقل'),
('queue_risk','label','You would have to answer for','ما ستحتاج إلى الإجابة عنه'),
('queue_clears_rules','label','Clears all of your rules','تجتاز جميع قواعدك'),
('queue_direct_cost','label','Direct application. One form, no recruiter call first.','تقديم مباشر. نموذج واحد، من دون مكالمة أولى مع مسؤول توظيف.'),
('queue_act','label','I will go for it','سأتقدّم لها'),
('queue_draft','label','Draft it','اكتب مسودة'),
('queue_later','label','Later','لاحقاً'),
('queue_not_for_me','label','Not for me','ليست لي'),
('queue_not_because','label','Not for me because','ليست لي لأن'),
('queue_or_wrong','label','Or something is wrong with it','أو أن فيها خطأ'),
('queue_wrong_level','label','Wrong level','مستوى غير مناسب'),
('queue_wrong_sector','label','Wrong sector','قطاع غير مناسب'),
('queue_wrong_org','label','Not this organisation','ليست هذه الجهة'),
('queue_wrong_place','label','Wrong place','مكان غير مناسب'),
('queue_just_one','label','Just this one','هذه فقط'),
('queue_dead_link','label','The link does not work','الرابط لا يعمل'),
('queue_quote_absent','label','The quote is not on the page','الاقتباس غير موجود في الصفحة'),
('queue_listing','label','It is a listing page','هذه صفحة قائمة'),
('queue_happened','label','This already happened','حدث هذا بالفعل'),
('queue_wrong_issuer','label','Wrong organisation','الجهة غير صحيحة'),
('queue_proposal_seen','label','item you have turned down.','فرصة رفضتها.'),
('queue_proposal_question','label','Shall we stop showing them? You can undo it any time, and it will not touch anything else.','هل نتوقف عن عرضها؟ يمكنك التراجع في أي وقت، ولن يتأثر أي شيء آخر.'),
('queue_yes_stop','label','Yes, stop','نعم، أوقفها'),
('queue_no_keep','label','No, keep them','لا، استمر بعرضها'),
('queue_must_true','label','Must be true','يجب أن تكون صحيحة'),
('queue_better_true','label','Better if true','يفضل أن تكون صحيحة'),
('queue_add_control','label','Add a sector or organisation','أضف قطاعاً أو جهة'),
('queue_held_title','label','Held back this month','محجوبة هذا الشهر'),
('queue_show_anyway','label','Show me anyway','أظهرها لي على أي حال'),
('queue_never_locked','label','Filtering never locks you out. You can reopen anything held back here.','التصفية لا تغلق الباب أمامك. يمكنك إعادة فتح أي فرصة محجوبة هنا.'),
('queue_today_done','label','That is today.','هذا كل شيء لليوم.'),
('queue_held_explain','label','Anything held back remains available behind What reaches you.','كل ما حُجب يبقى متاحاً ضمن ما يصلك.'),
('queue_still_weak','label','Nothing strong enough to send. The machine is still reading.','لا شيء قوياً بما يكفي لإرساله. ما زلنا نقرأ.'),
('queue_setup','label','Review what reaches you','راجع ما يصلك'),
('queue_history','label','History','السجل'),
('queue_why_seen','label','Why you saw this','لماذا ظهرت لك'),
('queue_outcome_ask','label','Did anything come of it?','هل نتج عنها شيء؟'),
('queue_applied','label','I applied','تقدّمت'),
('queue_shortlisted','label','I was shortlisted','وصلت إلى القائمة المختصرة'),
('queue_won','label','I got it','حصلت عليها'),
('queue_nothing','label','Nothing came of it','لم ينتج شيء'),
('queue_keys','label','1 choose · 2 later · 3 decline','1 اختيار · 2 لاحقاً · 3 رفض'),
('queue_close','label','Close','إغلاق')
ON CONFLICT(key) DO UPDATE SET kind=EXCLUDED.kind,en=EXCLUDED.en,ar=EXCLUDED.ar,updated_at=now();
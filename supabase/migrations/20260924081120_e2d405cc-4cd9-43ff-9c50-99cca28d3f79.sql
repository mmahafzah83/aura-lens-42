ALTER TABLE public.oe_cards
  ADD COLUMN IF NOT EXISTS stage text,
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text;

ALTER TABLE public.oe_cards DROP CONSTRAINT IF EXISTS oe_cards_stage_check;
ALTER TABLE public.oe_cards ADD CONSTRAINT oe_cards_stage_check
  CHECK (stage IS NULL OR stage IN ('saved','applied','interviewing','closed'));

CREATE INDEX IF NOT EXISTS oe_cards_user_stage_changed_idx
  ON public.oe_cards(user_id, stage, stage_changed_at DESC)
  WHERE opportunity_id IS NOT NULL;

UPDATE public.oe_cards c
SET stage = CASE
      WHEN c.withdrawn_at IS NOT NULL THEN 'closed'
      WHEN EXISTS (SELECT 1 FROM public.oe_outcomes x WHERE x.card_id=c.id AND x.stage IN ('shortlisted')) THEN 'interviewing'
      WHEN EXISTS (SELECT 1 FROM public.oe_outcomes x WHERE x.card_id=c.id AND x.stage IN ('won','declined','no_news','nothing','no')) THEN 'closed'
      WHEN EXISTS (SELECT 1 FROM public.oe_outcomes x WHERE x.card_id=c.id AND x.stage IN ('applied','pursued')) THEN 'applied'
      WHEN EXISTS (SELECT 1 FROM public.oe_serves s WHERE s.user_id=c.user_id AND s.opportunity_id=c.opportunity_id AND s.tap='later') THEN 'saved'
      ELSE c.stage END,
    stage_changed_at = COALESCE(c.stage_changed_at, c.withdrawn_at,
      (SELECT max(x.answered_at) FROM public.oe_outcomes x WHERE x.card_id=c.id),
      (SELECT max(s.tapped_at) FROM public.oe_serves s WHERE s.user_id=c.user_id AND s.opportunity_id=c.opportunity_id),
      c.updated_at, c.created_at),
    closed_reason = CASE
      WHEN c.withdrawn_at IS NOT NULL THEN COALESCE(c.closed_reason, c.withdrawn_reason, 'withdrawn')
      WHEN EXISTS (SELECT 1 FROM public.oe_outcomes x WHERE x.card_id=c.id AND x.stage='won') THEN COALESCE(c.closed_reason,'won')
      WHEN EXISTS (SELECT 1 FROM public.oe_outcomes x WHERE x.card_id=c.id AND x.stage IN ('declined','no','nothing')) THEN COALESCE(c.closed_reason,'closed')
      WHEN EXISTS (SELECT 1 FROM public.oe_outcomes x WHERE x.card_id=c.id AND x.stage='no_news') THEN COALESCE(c.closed_reason,'no_news')
      ELSE c.closed_reason END
WHERE c.opportunity_id IS NOT NULL
  AND (c.stage IS NULL OR c.stage_changed_at IS NULL OR (c.withdrawn_at IS NOT NULL AND c.closed_reason IS NULL));

CREATE OR REPLACE FUNCTION public.oe_card_stage_save(p_card uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_card public.oe_cards%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_stage NOT IN ('saved','applied','interviewing','closed') THEN RAISE EXCEPTION 'unknown stage'; END IF;
  SELECT * INTO v_card FROM public.oe_cards WHERE id=p_card AND user_id=v_uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation unavailable'; END IF;
  IF v_card.withdrawn_at IS NOT NULL AND p_stage <> 'closed' THEN RAISE EXCEPTION 'withdrawn recommendation is closed'; END IF;
  UPDATE public.oe_cards
     SET stage=p_stage, stage_changed_at=now(),
         closed_reason=CASE WHEN p_stage='closed' THEN COALESCE(closed_reason,'closed') ELSE NULL END,
         updated_at=now()
   WHERE id=v_card.id;
  RETURN jsonb_build_object('ok',true,'stage',p_stage,'changed_at',now());
END $$;
REVOKE ALL ON FUNCTION public.oe_card_stage_save(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_card_stage_save(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.oe_auto_save(p_user uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  WITH due AS (
    SELECT c.id
      FROM public.oe_cards c
      JOIN public.oe_serves s ON s.user_id=c.user_id AND s.opportunity_id=c.opportunity_id AND s.channel='app'
     WHERE c.opportunity_id IS NOT NULL
       AND c.stage IS NULL
       AND c.withdrawn_at IS NULL
       AND s.tap IS NULL
       AND s.shown_at < now() - interval '7 days'
       AND (p_user IS NULL OR c.user_id=p_user)
     GROUP BY c.id),
  changed AS (
    UPDATE public.oe_cards c
       SET stage='saved', stage_changed_at=now(), updated_at=now()
      FROM due WHERE c.id=due.id RETURNING c.id)
  SELECT count(*) INTO n FROM changed;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.oe_auto_save(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_auto_save(uuid) TO service_role;

DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE jobname='oe-auto-park-daily' OR command ILIKE '%oe_auto_park%'
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
  PERFORM cron.schedule('oe-auto-save-daily','15 0 * * *','select public.oe_auto_save(null);');
END $$;

DROP FUNCTION IF EXISTS public.oe_auto_park(uuid);

CREATE OR REPLACE FUNCTION public.oe_app_queue()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_payload jsonb; v_cards jsonb; v_moves jsonb; v_funnel jsonb; v_dir oe_direction%ROWTYPE;
  v_last timestamptz; v_running boolean; v_new_24h int; v_room int; v_el oe_eligibility%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.oe_auto_save(v_uid);
  v_payload := public.oe_app_queue_before_roles_surface();

  SELECT count(DISTINCT opportunity_id) INTO v_new_24h FROM oe_serves
   WHERE user_id=v_uid AND channel='app' AND shown_at > now() - interval '24 hours';
  v_room := GREATEST(0, 20 - COALESCE(v_new_24h,0));

  WITH x AS (
    SELECT value, ordinality,
      EXISTS (SELECT 1 FROM oe_serves s WHERE s.user_id=v_uid AND s.channel='app' AND s.opportunity_id=(value->>'opportunity_id')::uuid) shown,
      lower(trim(coalesce(value->>'title',''))) || '|' || public.oe_norm_employer(coalesce(value->>'issuer_name','')) twin
    FROM jsonb_array_elements(COALESCE(v_payload->'cards','[]'::jsonb)) WITH ORDINALITY
    WHERE value->>'lane' = 'act'
      AND NOT public.oe_card_is_repeat(v_uid, (value->>'opportunity_id')::uuid)
      AND EXISTS (SELECT 1 FROM oe_cards c WHERE c.user_id=v_uid AND c.opportunity_id=(value->>'opportunity_id')::uuid AND c.stage IS NULL AND c.withdrawn_at IS NULL)),
  d AS (SELECT DISTINCT ON (twin) * FROM x ORDER BY twin, ordinality),
  n AS (SELECT d.*, CASE WHEN shown THEN 0 ELSE row_number() OVER (PARTITION BY shown ORDER BY ordinality) END new_rank FROM d)
  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb) INTO v_cards
    FROM n WHERE shown OR new_rank <= v_room;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'card_id',c.id,'opportunity_id',c.opportunity_id,'stage',c.stage,
    'stage_changed_at',c.stage_changed_at,'closed_reason',c.closed_reason,
    'withdrawn_at',c.withdrawn_at,'title',o.title,
    'issuer_name',COALESCE(NULLIF(trim(o.issuer_raw),''),e.name,i.canonical_name),
    'location',o.location,'deadline',o.deadline,'source_url',o.source_url,'route_url',o.route_url)
    ORDER BY CASE c.stage WHEN 'saved' THEN 1 WHEN 'applied' THEN 2 WHEN 'interviewing' THEN 3 ELSE 4 END, c.stage_changed_at DESC), '[]'::jsonb)
    INTO v_moves
    FROM oe_cards c JOIN oe_opportunities o ON o.id=c.opportunity_id
    LEFT JOIN oe_entities e ON e.id=o.issuer_id LEFT JOIN oe_issuers i ON i.id=o.issuer_id
   WHERE c.user_id=v_uid AND c.opportunity_id IS NOT NULL AND c.stage IS NOT NULL;

  SELECT jsonb_build_object(
    'read', (SELECT count(*) FROM oe_opportunities o WHERE o.first_seen_at >= now()-interval '7 days'),
    'at_level_and_place', (SELECT count(*) FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
      WHERE m.user_id=v_uid AND m.screen_outcome='survivor' AND o.first_seen_at >= now()-interval '7 days'),
    'fits', (SELECT count(*) FROM oe_cards c WHERE c.user_id=v_uid AND c.opportunity_id IS NOT NULL AND c.withdrawn_at IS NULL))
    INTO v_funnel;

  SELECT * INTO v_dir FROM oe_direction WHERE user_id = v_uid LIMIT 1;
  SELECT * INTO v_el FROM oe_eligibility WHERE user_id = v_uid LIMIT 1;
  SELECT max(started_at) INTO v_last FROM oe_runs WHERE run_kind IN ('harvest','harvest_ats','fetch_feed','read_posting','triage');
  v_running := COALESCE(v_last > now() - interval '5 minutes', false);

  RETURN jsonb_set(v_payload,'{cards}',v_cards) || jsonb_build_object(
    'moves',v_moves,'funnel',v_funnel,
    'direction', COALESCE(v_payload->'direction','{}'::jsonb) || jsonb_build_object(
      'move_kind', v_dir.move_kind, 'move_confirmed_at', v_dir.move_confirmed_at, 'move_proposed', v_dir.move_proposed),
    'delivery', jsonb_build_object('at_a_time', COALESCE(v_el.cards_at_a_time,3), 'instant', COALESCE(v_el.alert_instant,true),
       'digest', COALESCE(v_el.digest_on,true), 'digest_hour', COALESCE(v_el.digest_hour,8), 'ceiling', 20, 'room_today', v_room),
    'reading', jsonb_build_object('running', v_running, 'last_read_at', v_last),
    'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'text',n.rule_text,'text_ar',n.rule_text_ar,
        'said_on',n.stated_on,'field',n.field,'value',n.value) ORDER BY n.stated_on, n.id)
      FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='comment' AND n.status='proposed'), '[]'::jsonb),
    'rules', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'rule_text',n.rule_text,'rule_text_ar',n.rule_text_ar,
        'field',n.field,'value',n.value,'stated_on',n.stated_on,'active',n.active) ORDER BY n.stated_on DESC, n.id)
      FROM oe_notebook n WHERE n.user_id=v_uid AND n.entry_kind='rule' AND n.status='active' AND n.active), '[]'::jsonb),
    'quiet_day', jsonb_build_object(
      'surfaces_read', (SELECT count(*) FROM oe_runs r WHERE r.run_kind IN ('harvest','harvest_ats','fetch_feed') AND r.started_at >= current_date),
      'findings', (SELECT count(*) FROM oe_opportunities o WHERE o.first_seen_at >= current_date),
      'from_date', current_date, 'to_date', current_date));
END $$;

INSERT INTO public.oe_vocabulary(key,en,ar,kind) VALUES
('view_for_you','For you','لك','label'),
('view_explore','Explore','استكشف','label'),
('view_your_moves','Your moves','خطواتك','label'),
('view_your_settings','Your settings','إعداداتك','label'),
('subtitle_for_you','What fits me?','ما الذي يناسبني؟','label'),
('subtitle_explore','What else is out there?','ماذا يوجد أيضاً؟','label'),
('subtitle_your_moves','What am I doing with them?','ماذا أفعل بهذه الفرص؟','label'),
('tip_for_you','Recommendations here have cleared our review and your settings. They are ranked best-first.','التوصيات هنا اجتازت مراجعتنا وإعداداتك. وتظهر الأقوى أولاً.','label'),
('tip_explore','Start with your settings, then use temporary filters to look wider. Nothing changes your settings unless you save it.','ابدأ بإعداداتك، ثم استخدم المرشحات المؤقتة لتوسيع البحث. لن تتغير إعداداتك إلا إذا حفظت التغيير.','label'),
('tip_your_moves','Keep every recommendation you are acting on in one place. Move it forward with one tap; closed and withdrawn items remain visible.','احتفظ بكل توصية تعمل عليها في مكان واحد. انقلها بخطوة واحدة؛ وتبقى العناصر المغلقة والمسحوبة ظاهرة.','label'),
('settings_subtitle','Shapes what we recommend and where Explore starts.','تحدد ما نوصي به ومن أين يبدأ الاستكشاف.','label'),
('funnel_line','{read} read → {at_level_and_place} at your level and place → {fits} fit you','{read} قُرئت ← {at_level_and_place} بمستواك وفي أماكنك ← {fits} تناسبك','label'),
('tip_funnel','We read every role we find, keep the ones at your level in places you can work, then compare each with your record. Only those that clear the bar reach For you.','نقرأ كل دور نجده، ونحتفظ بما يلائم مستواك والأماكن التي يمكنك العمل فيها، ثم نقارن كل دور بسجلك. لا يصل إلى «لك» إلا ما يتجاوز المعيار.','label'),
('for_you_empty','Nothing fits you yet. We checked {n} roles this week. Next check at {time}.','لا توجد فرصة تناسبك بعد. راجعنا {n} دوراً هذا الأسبوع. المراجعة التالية عند {time}.','state'),
('for_you_empty_explore','Explore what else is out there','استكشف ما يوجد أيضاً','action'),
('stage_saved','Saved for later','محفوظ لوقت لاحق','label'),
('stage_applied','Applied','تقدّمت لها','label'),
('stage_interviewing','Interviewing','في المقابلات','label'),
('stage_closed','Closed','مغلقة','label'),
('stage_move_to','Move to {stage}','انقل إلى {stage}','action'),
('stage_changed','Moved {date}','نُقلت في {date}','label'),
('moves_empty','Nothing here yet. Save a recommendation or mark that you applied.','لا شيء هنا بعد. احفظ توصية أو سجّل أنك تقدّمت لها.','state'),
('withdrawn_prefix','Withdrawn','سُحبت','label'),
('withdrawn_place','outside your places','خارج أماكنك','label'),
('withdrawn_closed','posting closed','أُغلق الإعلان','label'),
('withdrawn_other','no longer available','لم تعد متاحة','label'),
('rules_dialog_title','Your settings','إعداداتك','label'),
('rules_dialog_subtitle','Shapes what we recommend and where Explore starts.','تحدد ما نوصي به ومن أين يبدأ الاستكشاف.','label')
ON CONFLICT (key) DO UPDATE SET en=excluded.en, ar=excluded.ar, kind=excluded.kind;
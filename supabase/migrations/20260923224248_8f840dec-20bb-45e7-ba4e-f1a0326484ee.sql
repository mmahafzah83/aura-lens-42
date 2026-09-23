
-- ── Delivery preferences ─────────────────────────────────────────────
alter table public.oe_eligibility
  add column if not exists cards_at_a_time int not null default 3,
  add column if not exists alert_instant boolean not null default true,
  add column if not exists digest_on boolean not null default true,
  add column if not exists digest_hour int not null default 8;
alter table public.oe_eligibility drop constraint if exists oe_eligibility_cards_at_a_time_check;
alter table public.oe_eligibility add constraint oe_eligibility_cards_at_a_time_check check (cards_at_a_time in (0,1,3,5));
alter table public.oe_eligibility drop constraint if exists oe_eligibility_digest_hour_check;
alter table public.oe_eligibility add constraint oe_eligibility_digest_hour_check check (digest_hour in (7,8,9));

alter table public.oe_cards add column if not exists alert_kind text, add column if not exists alerted_at timestamptz;

-- Many cards a day are allowed; only the empty-day placeholder stays one per day.
drop index if exists public.oe_cards_one_unsent_per_day;
create unique index if not exists oe_cards_one_empty_per_day on public.oe_cards(user_id, card_date)
  where sent_at is null and opportunity_id is null;

-- "Later" was refused by the serve check; parking could never be written.
alter table public.oe_serves drop constraint if exists oe_serves_tap_check;
alter table public.oe_serves add constraint oe_serves_tap_check check (tap = any (array['right','not_quite','not_my_area','later']));

create or replace function public.oe_delivery_save(p_at_a_time int, p_instant boolean, p_digest boolean, p_digest_hour int)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required'; end if;
  if p_at_a_time not in (0,1,3,5) then raise exception 'how many at a time must be 1, 3, 5 or all'; end if;
  if p_digest_hour not in (7,8,9) then raise exception 'daily summary hour must be 7, 8 or 9'; end if;
  insert into oe_eligibility(user_id, cards_at_a_time, alert_instant, digest_on, digest_hour)
    values (v_uid, p_at_a_time, p_instant, p_digest, p_digest_hour)
  on conflict (user_id) do update set cards_at_a_time=excluded.cards_at_a_time, alert_instant=excluded.alert_instant,
    digest_on=excluded.digest_on, digest_hour=excluded.digest_hour, updated_at=now();
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.oe_delivery_save(int,boolean,boolean,int) from public, anon;
grant execute on function public.oe_delivery_save(int,boolean,boolean,int) to authenticated;

-- ── No repeats: same title + employer within 30 days is the same card ──
create or replace function public.oe_card_is_repeat(p_user uuid, p_opp uuid)
returns boolean language sql stable security definer set search_path=public as $$
  with me as (select lower(trim(coalesce(title,''))) t, public.oe_norm_employer(coalesce(issuer_raw,'')) e from oe_opportunities where id=p_opp),
  hist as (
    select opportunity_id, created_at at from oe_cards where user_id=p_user and opportunity_id is not null and opportunity_id<>p_opp
    union all
    select opportunity_id, shown_at from oe_serves where user_id=p_user and opportunity_id is not null and opportunity_id<>p_opp)
  select exists (
    select 1 from hist h join oe_opportunities o2 on o2.id=h.opportunity_id, me
    where h.at > now() - interval '30 days' and me.t <> ''
      and lower(trim(coalesce(o2.title,''))) = me.t
      and public.oe_norm_employer(coalesce(o2.issuer_raw,'')) = me.e);
$$;
revoke all on function public.oe_card_is_repeat(uuid,uuid) from public, anon, authenticated;
grant execute on function public.oe_card_is_repeat(uuid,uuid) to service_role;

-- ── Auto-park: shown and untouched for 7 days ──────────────────────────
create or replace function public.oe_auto_park(p_user uuid default null)
returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  with due as (
    select id, user_id, card_id, opportunity_id from oe_serves
    where channel='app' and tap is null and shown_at < now() - interval '7 days'
      and (p_user is null or user_id = p_user)),
  taps as (
    insert into oe_taps(user_id, card_id, opportunity_id, tap, source, tapped_at)
    select user_id, card_id, opportunity_id, 'later', null, now() from due
    on conflict do nothing returning 1)
  update oe_serves s set tap='later', tapped_at=now(), updated_at=now() from due where s.id=due.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.oe_auto_park(uuid) from public, anon, authenticated;
grant execute on function public.oe_auto_park(uuid) to service_role;

-- ── A card is shown once: a render reuses the first serve ─────────────
create or replace function public.oe_app_render(p_card uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_uid uuid:=auth.uid(); v_opp oe_opportunities%ROWTYPE; v_match oe_matches%ROWTYPE;
  v_evidence jsonb; v_rules jsonb; v_why jsonb; v_serve uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_opp FROM oe_opportunities WHERE id=p_card AND alive;
  IF NOT FOUND THEN RAISE EXCEPTION 'opportunity unavailable'; END IF;
  SELECT id INTO v_serve FROM oe_serves WHERE user_id=v_uid AND opportunity_id=p_card AND channel='app' ORDER BY shown_at LIMIT 1;
  IF v_serve IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'serve_id',v_serve,'already_shown',true); END IF;
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
      OR (n.field='place' AND public.oe_place_weight(v_uid,v_opp.location,v_opp.sector) >= 1.0)
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

-- ── The queue: no fixed count; ceiling of 20 new per rolling 24h ──────
create or replace function public.oe_app_queue()
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_uid uuid := auth.uid(); v_payload jsonb; v_cards jsonb; v_dir oe_direction%ROWTYPE;
  v_last timestamptz; v_running boolean; v_new_24h int; v_room int; v_el oe_eligibility%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM public.oe_auto_park(v_uid);
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
      AND NOT public.oe_card_is_repeat(v_uid, (value->>'opportunity_id')::uuid)),
  d AS (SELECT DISTINCT ON (twin) * FROM x ORDER BY twin, ordinality),
  n AS (SELECT d.*, CASE WHEN shown THEN 0 ELSE row_number() OVER (PARTITION BY shown ORDER BY ordinality) END new_rank FROM d)
  SELECT COALESCE(jsonb_agg(value ORDER BY ordinality), '[]'::jsonb) INTO v_cards
    FROM n WHERE shown OR new_rank <= v_room;

  SELECT * INTO v_dir FROM oe_direction WHERE user_id = v_uid LIMIT 1;
  SELECT * INTO v_el FROM oe_eligibility WHERE user_id = v_uid LIMIT 1;

  SELECT max(started_at) INTO v_last FROM oe_runs
   WHERE run_kind IN ('harvest','harvest_ats','fetch_feed','read_posting','triage');
  v_running := COALESCE(v_last > now() - interval '5 minutes', false);

  RETURN jsonb_set(v_payload,'{cards}',v_cards) || jsonb_build_object(
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
      'surfaces_read', (SELECT count(*) FROM oe_runs r WHERE r.run_kind IN ('harvest','harvest_ats','fetch_feed')
                         AND r.started_at >= current_date),
      'findings', (SELECT count(*) FROM oe_opportunities o WHERE o.first_seen_at >= current_date),
      'from_date', current_date, 'to_date', current_date));
END $function$;

-- ── Words ─────────────────────────────────────────────────────────────
insert into oe_vocabulary(key, en, ar, kind) values
 ('delivery_title','Delivery','التسليم','label'),
 ('delivery_at_a_time','How many at a time','كم فرصة في كل مرة','label'),
 ('delivery_all','All','الكل','label'),
 ('delivery_instant','Email me straight away for the strongest roles','أرسل لي بريداً فوراً عند ظهور أقوى الأدوار','label'),
 ('delivery_digest','Daily summary','الملخص اليومي','label'),
 ('delivery_digest_at','Daily summary at','وقت الملخص اليومي','label'),
 ('delivery_off','Off','متوقف','label'),
 ('delivery_saved','Saved','حُفظ','label'),
 ('more_cleared','More that cleared your bar','فرص أخرى تجاوزت معيارك','label'),
 ('email_instant_subject','A role that clears your bar: {title}','دور يتجاوز معيارك: {title}','label'),
 ('email_instant_intro','This one is among the strongest we have found for you.','هذا من أقوى ما وجدناه لك.','label'),
 ('email_digest_subject','{n} new roles cleared your bar','{n} أدوار جديدة تجاوزت معيارك','label'),
 ('email_digest_intro','Here is what cleared your bar since your last summary.','هذا ما تجاوز معيارك منذ ملخصك الأخير.','label'),
 ('email_open','Open in Aura','افتح في Aura','label'),
 ('email_footer','You chose these emails in Tune. Change or stop them there at any time.','اخترت هذه الرسائل من الضبط، ويمكنك تغييرها أو إيقافها من هناك في أي وقت.','label')
on conflict (key) do update set en=excluded.en, ar=excluded.ar;

ALTER FUNCTION public.oe_app_queue() RENAME TO oe_app_queue_before_roles_surface;

CREATE OR REPLACE FUNCTION public.oe_app_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_payload jsonb;
  v_cards jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  v_payload := public.oe_app_queue_before_roles_surface();

  SELECT COALESCE(jsonb_agg(x.value ORDER BY x.ordinality), '[]'::jsonb)
    INTO v_cards
    FROM jsonb_array_elements(COALESCE(v_payload->'cards', '[]'::jsonb)) WITH ORDINALITY x(value, ordinality)
   WHERE x.ordinality <= 3 AND x.value->>'lane' = 'act';

  RETURN jsonb_set(v_payload, '{cards}', v_cards)
    || jsonb_build_object(
      'quiet_day', jsonb_build_object(
        'surfaces_read', (SELECT count(*) FROM oe_surfaces s
                           WHERE s.last_harvested_at >= current_date - interval '1 day'
                             AND s.last_harvested_at < current_date + interval '1 day'),
        'findings', (SELECT count(*) FROM oe_opportunities o
                      WHERE o.first_seen_at >= current_date - interval '1 day'
                        AND o.first_seen_at < current_date + interval '1 day'),
        'from_date', current_date - 1,
        'to_date', current_date
      )
    );
END
$function$;
REVOKE ALL ON FUNCTION public.oe_app_queue_before_roles_surface() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_app_queue_before_roles_surface() TO service_role;
REVOKE ALL ON FUNCTION public.oe_app_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_app_queue() TO authenticated;

CREATE OR REPLACE FUNCTION public.oe_notebook_decline_comment(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE oe_notebook
     SET status = 'declined', active = false, proposal_status = 'declined', updated_at = now()
   WHERE id = p_id AND user_id = v_uid AND entry_kind = 'comment' AND status = 'proposed';
  IF NOT FOUND THEN RAISE EXCEPTION 'comment unavailable'; END IF;
  RETURN jsonb_build_object('ok', true);
END
$function$;
REVOKE ALL ON FUNCTION public.oe_notebook_decline_comment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_notebook_decline_comment(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oe_notebook_remove_rule(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE oe_notebook
     SET status = 'declined', active = false, proposal_status = 'declined', updated_at = now()
   WHERE id = p_id AND user_id = v_uid AND entry_kind = 'rule' AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'rule unavailable'; END IF;
  PERFORM public.oe_rebuild_eligibility(v_uid);
  RETURN jsonb_build_object('ok', true);
END
$function$;
REVOKE ALL ON FUNCTION public.oe_notebook_remove_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_notebook_remove_rule(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.oe_member_home(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with iso as (
    select upper(nullif(trim(dp.country_code),'')) as code
    from diagnostic_profiles dp where dp.user_id = p_user limit 1
  ), city as (
    select nullif(trim(split_part(s.location, ',', 1)),'') as name
    from linkedin_profile_snapshots s where s.user_id = p_user and nullif(trim(s.location),'') is not null
    order by s.created_at desc limit 1
  ), country as (
    select c.iso2, c.name_en, c.name_ar, c.region_codes from oe_ref_countries c join iso on iso.code = c.iso2
  )
  select jsonb_build_object(
    'city', (select name from city), 'country', (select iso2 from country),
    'country_name', (select name_en from country),
    'regions', coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'name_en',r.name_en,'name_ar',r.name_ar) order by r.sort)
                         from oe_ref_regions r where r.code = any(array(select unnest(c.region_codes) from country c))), '[]'::jsonb));
$function$;

INSERT INTO public.oe_vocabulary(key, en, ar, kind) VALUES
  ('rules_gear_aria','Open your rules','افتح قواعدك','label'),
  ('today_stack_aria','Today''s roles','أدوار اليوم','label'),
  ('stack_no_closing_date','No closing date','لا تاريخ إغلاق','label'),
  ('quiet_title','A quiet day','يوم هادئ','label'),
  ('quiet_body','Since yesterday, we read {sources} sources and found {findings} possibilities.','منذ الأمس، قرأنا {sources} مصدراً ووجدنا {findings} احتمالاً.','label'),
  ('quiet_none_cleared','None cleared your bar.','لم يتجاوز أي منها معاييرك.','label'),
  ('quiet_window','Read from {from} to {to}','قراءة من {from} إلى {to}','label'),
  ('held_back_title','Held back','محجوبة','label'),
  ('held_see_why','See why','اعرف السبب','action'),
  ('held_hide_why','Hide reasons','أخفِ الأسباب','action'),
  ('current_bar_title','Your current bar','معاييرك الحالية','label'),
  ('settings_place','Place','المكان','label'),
  ('rules_dialog_title','Your rules','قواعدك','label'),
  ('rules_bar_title','Your bar','معاييرك','label'),
  ('rules_set_on','Set {date}','حُدد في {date}','label'),
  ('rules_ask_again','Ask again {date}','نسألك مجدداً في {date}','label'),
  ('rules_comments_title','Things you said — shall we make these rules?','أشياء قلتها — هل نجعلها قواعد؟','label'),
  ('rules_make_rule','Make it a rule','اجعلها قاعدة','action'),
  ('rules_more','{n} more →','{n} أخرى ←','action'),
  ('rules_comments_empty','Nothing is waiting for your answer.','لا شيء ينتظر إجابتك.','label'),
  ('rules_active_title','Active rules','القواعد الفعالة','label'),
  ('rules_active_empty','No active rules.','لا قواعد فعالة.','label'),
  ('rules_remove','Remove','احذف','action'),
  ('rules_private','Nothing here is published or shared.','لا يُنشر أو يُشارك أي شيء هنا.','label'),
  ('rules_export','Export your data','صدّر بياناتك','action'),
  ('rules_delete','Delete your data','احذف بياناتك','action')
ON CONFLICT (key) DO UPDATE SET en = EXCLUDED.en, ar = EXCLUDED.ar, kind = EXCLUDED.kind;
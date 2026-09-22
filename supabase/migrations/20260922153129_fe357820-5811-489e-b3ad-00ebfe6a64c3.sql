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
      'comments', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', n.id, 'text', n.rule_text, 'text_ar', n.rule_text_ar,
          'said_on', n.stated_on, 'field', n.field, 'value', n.value
        ) ORDER BY n.stated_on, n.id)
        FROM oe_notebook n
        WHERE n.user_id = v_uid AND n.entry_kind = 'comment'
          AND n.status = 'proposed' AND n.active
      ), '[]'::jsonb),
      'rules', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', n.id, 'rule_text', n.rule_text, 'rule_text_ar', n.rule_text_ar,
          'field', n.field, 'value', n.value, 'stated_on', n.stated_on, 'active', n.active
        ) ORDER BY n.stated_on DESC, n.id)
        FROM oe_notebook n
        WHERE n.user_id = v_uid AND n.entry_kind = 'rule'
          AND n.status = 'active' AND n.active
      ), '[]'::jsonb),
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
REVOKE ALL ON FUNCTION public.oe_app_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_app_queue() TO authenticated;
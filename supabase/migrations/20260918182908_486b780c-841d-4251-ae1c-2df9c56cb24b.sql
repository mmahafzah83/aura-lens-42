
CREATE OR REPLACE FUNCTION public.oe_record_tap(p_token text, p_tap text, p_scope text DEFAULT NULL::text, p_scope_value text DEFAULT NULL::text, p_source text DEFAULT 'email'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.oe_cards%ROWTYPE;
  v_source text;
BEGIN
  IF p_tap IS NULL OR p_tap NOT IN ('right','not_quite','not_my_area','less_from_here') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_tap');
  END IF;

  IF p_scope IS NOT NULL AND p_scope NOT IN ('issuer','level','place','type','just_this') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_scope');
  END IF;

  v_source := CASE WHEN p_source = 'app' THEN 'inapp' ELSE p_source END;
  IF v_source NOT IN ('email','whatsapp','inapp') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_source');
  END IF;

  SELECT * INTO v_card
  FROM public.oe_cards
  WHERE tap_token = p_token AND token_expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired_or_unknown');
  END IF;

  INSERT INTO public.oe_taps (user_id, card_id, tap, scope, scope_value, source, applied_at)
  VALUES (v_card.user_id, v_card.id, p_tap, p_scope, p_scope_value, v_source, NULL)
  ON CONFLICT (card_id, tap) DO UPDATE
    SET scope = EXCLUDED.scope,
        scope_value = EXCLUDED.scope_value,
        source = EXCLUDED.source,
        tapped_at = now(),
        applied_at = NULL;

  -- BOOK TWO. Taste stays in this member's lane.
  INSERT INTO public.oe_serves (user_id, card_id, opportunity_id, channel, lane, why,
                                tap, tapped_at, tap_scope, tap_scope_value, signal_class)
  VALUES (v_card.user_id, v_card.id, v_card.opportunity_id,
          CASE WHEN v_source = 'inapp' THEN 'app' ELSE 'email' END,
          v_card.lane, jsonb_build_object('rules', '[]'::jsonb, 'faces', '[]'::jsonb,
                                          'scores', jsonb_build_object('fit', v_card.fit_band, 'win', v_card.win_band),
                                          'gate', 'pass'),
          CASE WHEN p_tap = 'less_from_here' THEN 'not_quite' ELSE p_tap END,
          now(), COALESCE(p_scope, CASE WHEN p_tap = 'less_from_here' THEN 'issuer' END), p_scope_value, 'taste')
  ON CONFLICT (card_id) DO UPDATE
    SET tap = EXCLUDED.tap, tapped_at = now(),
        tap_scope = EXCLUDED.tap_scope, tap_scope_value = EXCLUDED.tap_scope_value,
        signal_class = 'taste', updated_at = now();

  UPDATE public.oe_cards
     SET opened_at = COALESCE(opened_at, now()),
         kit_offered = CASE WHEN p_tap = 'right' THEN true ELSE kit_offered END
   WHERE id = v_card.id;

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', v_card.id,
    'tap', p_tap,
    'next', CASE
      WHEN p_tap IN ('not_quite','not_my_area') AND p_scope IS NULL THEN 'which_part'
      ELSE 'thanks'
    END
  );
END;
$function$;

-- TRUTH. A fact about the world travels to every member and carries no trace
-- of the person who reported it: nothing about him is written to Book Three.
CREATE OR REPLACE FUNCTION public.oe_record_truth(p_token text, p_code text, p_source text DEFAULT 'app'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.oe_cards%ROWTYPE;
  v_opp public.oe_opportunities%ROWTYPE;
BEGIN
  IF p_code NOT IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;

  SELECT * INTO v_card FROM public.oe_cards
   WHERE tap_token = p_token AND token_expires_at > now();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired_or_unknown');
  END IF;

  INSERT INTO public.oe_serves (user_id, card_id, opportunity_id, channel, lane, why,
                                tapped_at, signal_class, truth_code)
  VALUES (v_card.user_id, v_card.id, v_card.opportunity_id,
          CASE WHEN p_source = 'email' THEN 'email' ELSE 'app' END,
          v_card.lane, jsonb_build_object('rules','[]'::jsonb,'faces','[]'::jsonb,'scores','{}'::jsonb,'gate','pass'),
          now(), 'truth', p_code)
  ON CONFLICT (card_id) DO UPDATE
    SET signal_class = 'truth', truth_code = EXCLUDED.truth_code,
        tapped_at = now(), updated_at = now();

  IF v_card.opportunity_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'card_id', v_card.id, 'code', p_code, 'global', false);
  END IF;

  SELECT * INTO v_opp FROM public.oe_opportunities WHERE id = v_card.opportunity_id;

  IF p_code = 'dead_route' THEN
    UPDATE public.oe_opportunities SET route_dead = true WHERE id = v_opp.id;
  ELSIF p_code = 'quote_absent' THEN
    UPDATE public.oe_opportunities SET quote_verified = false WHERE id = v_opp.id;
  ELSE
    UPDATE public.oe_opportunities SET alive = false WHERE id = v_opp.id;
  END IF;

  -- BOOK THREE. No member column exists on this table, by design.
  INSERT INTO public.oe_world_facts (kind, entity_id, payload, evidence_url, confidence)
  VALUES (CASE WHEN p_code = 'listing_page' THEN 'aggregator_fingerprint'
               WHEN p_code = 'already_happened' THEN 'recurring_event'
               ELSE 'route_pattern' END,
          NULL,
          jsonb_build_object('code', p_code, 'opportunity_id', v_opp.id, 'feed_id', v_opp.feed_id),
          COALESCE(v_opp.route_url, v_opp.source_url), 0.8);

  RETURN jsonb_build_object('ok', true, 'card_id', v_card.id, 'code', p_code, 'global', true);
END;
$function$;

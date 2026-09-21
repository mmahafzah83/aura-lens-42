-- ONE FACT, ONE TABLE. oe_taps is the record of a decision; oe_serves keeps a
-- mirror written by the same call, in the same transaction, and never alone.
ALTER TABLE public.oe_taps
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS truth_code text;
ALTER TABLE public.oe_taps ALTER COLUMN card_id DROP NOT NULL;
ALTER TABLE public.oe_taps DROP CONSTRAINT IF EXISTS oe_taps_card_id_tap_key;
ALTER TABLE public.oe_taps DROP CONSTRAINT IF EXISTS oe_taps_tap_check;
ALTER TABLE public.oe_taps ADD CONSTRAINT oe_taps_tap_check
  CHECK (tap = ANY (ARRAY['right','not_quite','not_my_area','less_from_here','later']));
ALTER TABLE public.oe_taps DROP CONSTRAINT IF EXISTS oe_taps_source_check;
ALTER TABLE public.oe_taps ADD CONSTRAINT oe_taps_source_check
  CHECK (source IS NULL OR source = ANY (ARRAY['email','whatsapp','inapp','truth']));
ALTER TABLE public.oe_taps DROP CONSTRAINT IF EXISTS oe_taps_subject_present;
ALTER TABLE public.oe_taps ADD CONSTRAINT oe_taps_subject_present
  CHECK (card_id IS NOT NULL OR opportunity_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS oe_taps_one_per_card
  ON public.oe_taps (user_id, card_id, tap) WHERE card_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS oe_taps_one_per_opportunity
  ON public.oe_taps (user_id, opportunity_id, tap) WHERE card_id IS NULL AND opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS oe_taps_unapplied ON public.oe_taps (applied_at, tapped_at) WHERE applied_at IS NULL;

-- Every decision writes the record first, then its mirror.
CREATE OR REPLACE FUNCTION public.oe_app_decide(p_card uuid, p_action text, p_scope text DEFAULT NULL::text, p_scope_value text DEFAULT NULL::text, p_truth text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); v_serve oe_serves%ROWTYPE; v_count int:=0; v_proposal uuid; v_opp oe_opportunities%ROWTYPE; v_tap text;
BEGIN
  IF p_action NOT IN ('right','not_quite','later') THEN RAISE EXCEPTION 'unknown decision'; END IF;
  SELECT * INTO v_serve FROM oe_serves WHERE opportunity_id=p_card AND user_id=v_uid AND channel='app' AND tap IS NULL ORDER BY shown_at DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'serve unavailable'; END IF;
  SELECT * INTO v_opp FROM oe_opportunities WHERE id=p_card;

  IF p_action='later' THEN
    INSERT INTO oe_taps(user_id,card_id,opportunity_id,tap,source,tapped_at)
    VALUES(v_uid,v_serve.card_id,p_card,'later','inapp',now())
    ON CONFLICT DO NOTHING;
    UPDATE oe_serves SET tap='later',tapped_at=now(),updated_at=now() WHERE id=v_serve.id;
    RETURN jsonb_build_object('ok',true,'later',true);
  END IF;

  IF p_truth IS NOT NULL THEN
    IF p_truth NOT IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer') THEN RAISE EXCEPTION 'unknown truth'; END IF;
    INSERT INTO oe_taps(user_id,card_id,opportunity_id,tap,source,truth_code,tapped_at)
    VALUES(v_uid,v_serve.card_id,p_card,'not_my_area','truth',p_truth,now())
    ON CONFLICT DO NOTHING;
    UPDATE oe_serves SET tap='not_my_area',tapped_at=now(),signal_class='truth',truth_code=p_truth,updated_at=now() WHERE id=v_serve.id;
    IF p_truth='dead_route' THEN UPDATE oe_opportunities SET route_dead=true WHERE id=p_card;
    ELSIF p_truth='quote_absent' THEN UPDATE oe_opportunities SET quote_verified=false, quote_fail_reason='quote_absent', quote_fail_detail='reported by a member', quote_last_attempt_at=now() WHERE id=p_card;
    ELSE UPDATE oe_opportunities SET alive=false WHERE id=p_card; END IF;
    INSERT INTO oe_world_facts(kind,payload,evidence_url,confidence)
    VALUES(CASE WHEN p_truth='listing_page' THEN 'aggregator_fingerprint' WHEN p_truth='already_happened' THEN 'recurring_event' ELSE 'route_pattern' END,
      jsonb_build_object('code',p_truth,'opportunity_id',p_card,'feed_id',v_opp.feed_id),COALESCE(v_opp.route_url,v_opp.source_url),0.8);
    RETURN jsonb_build_object('ok',true);
  END IF;

  v_tap := CASE WHEN p_action='right' THEN 'right' ELSE 'not_my_area' END;
  INSERT INTO oe_taps(user_id,card_id,opportunity_id,tap,scope,scope_value,source,tapped_at)
  VALUES(v_uid,v_serve.card_id,p_card,v_tap,
    CASE WHEN p_scope IN ('issuer','level','place','type','just_this') THEN p_scope END,
    p_scope_value,'inapp',now())
  ON CONFLICT DO NOTHING;

  UPDATE oe_serves SET tap=v_tap,tapped_at=now(),tap_scope=p_scope,tap_scope_value=p_scope_value,
    signal_class=CASE WHEN p_action='right' THEN 'taste' WHEN p_action='not_quite' THEN 'taste' END,
    pursued=CASE WHEN p_action='right' THEN true ELSE pursued END,
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

-- THE INVARIANT. A decision on a serve with no tap row is a fault.
CREATE OR REPLACE VIEW public.oe_serves_untapped
WITH (security_invoker = true) AS
SELECT s.id AS serve_id, s.user_id, s.opportunity_id, s.card_id, s.tap, s.tapped_at
FROM public.oe_serves s
WHERE s.tap IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.oe_taps t
    WHERE t.user_id = s.user_id
      AND t.tap = s.tap
      AND (t.card_id IS NOT DISTINCT FROM s.card_id OR t.opportunity_id IS NOT DISTINCT FROM s.opportunity_id));
REVOKE ALL ON public.oe_serves_untapped FROM anon, authenticated;
GRANT SELECT ON public.oe_serves_untapped TO service_role;
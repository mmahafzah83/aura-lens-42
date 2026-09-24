CREATE OR REPLACE FUNCTION public.oe_card_stage_save(p_card uuid, p_stage text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_changed timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_stage NOT IN ('saved','applied','interviewing','closed') THEN RAISE EXCEPTION 'unknown stage'; END IF;
  IF EXISTS (SELECT 1 FROM public.oe_cards WHERE id=p_card AND user_id=v_uid AND withdrawn_at IS NOT NULL) AND p_stage <> 'closed' THEN
    RAISE EXCEPTION 'withdrawn recommendation is closed';
  END IF;
  UPDATE public.oe_cards
     SET stage=p_stage, stage_changed_at=v_changed,
         closed_reason=CASE WHEN p_stage='closed' THEN COALESCE(closed_reason,'closed') ELSE NULL END,
         updated_at=v_changed
   WHERE id=p_card AND user_id=v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation unavailable'; END IF;
  RETURN jsonb_build_object('ok',true,'stage',p_stage,'changed_at',v_changed);
END $$;
REVOKE ALL ON FUNCTION public.oe_card_stage_save(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_card_stage_save(uuid,text) TO authenticated;
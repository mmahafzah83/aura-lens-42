CREATE OR REPLACE FUNCTION public.reset_journey(p_user_id uuid DEFAULT NULL::uuid, p_wipe_captures boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_out jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not signed in';
  END IF;
  -- You may reset yourself. Resetting anyone else requires admin.
  IF v_target <> v_caller AND NOT public.has_role(v_caller, 'admin') THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  /* Every column the journey writes at finish. writeProfile cannot do this —
     it drops nulls by design — so the reset must live here in SQL. */
  UPDATE public.diagnostic_profiles SET
    onboarding_step = 0,
    onboarding_completed = false,
    completed = false,
    instrument_version = NULL,
    answered_band = NULL,
    seniority_band = NULL,
    band_source = NULL,
    skill_ratings = '{}'::jsonb,
    audit_results = '{}'::jsonb,
    audit_method = NULL,
    audit_completed_at = NULL,
    generated_skills = NULL,
    brand_assessment_answers = NULL,
    brand_assessment_answers_coded = '{}'::jsonb,
    brand_assessment_results = NULL,
    brand_assessment_completed_at = NULL,
    brand_pillars = NULL,
    cv_crosscheck = NULL,
    identity_intelligence = '{}'::jsonb,
    journey_reset_at = now()
  WHERE user_id = v_target;

  DELETE FROM public.report_snapshots   WHERE user_id = v_target;
  DELETE FROM public.market_read        WHERE user_id = v_target;
  DELETE FROM public.assessment_sessions WHERE user_id = v_target;
  DELETE FROM public.evidence_jobs      WHERE user_id = v_target;

  IF p_wipe_captures THEN
    DELETE FROM public.evidence_fragments WHERE user_id = v_target;
    DELETE FROM public.entries            WHERE user_id = v_target;
  END IF;

  v_out := jsonb_build_object(
    'ok', true,
    'user_id', v_target,
    'captures_wiped', p_wipe_captures,
    'reset_at', now()
  );
  RETURN v_out;
END $function$;

-- ── A1. Judge sooner: every two hours, same kill-switch guard ──────────────
SELECT cron.unschedule('oe-enqueue-judging-daily');
SELECT cron.schedule('oe-enqueue-judging-2h', '30 */2 * * *', $cron$do $q$ begin if public.oe_run_allowed('oe-enqueue-judging-2h') then perform net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-enqueue-judging',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  ); end if; end $q$;$cron$);

-- ── A2. Ask for one opportunity to be matched now ─────────────────────────
CREATE OR REPLACE FUNCTION public.oe_app_check_now(p_opportunity uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_asks int;
  v_job uuid;
  v_ids jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_opportunity IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_opportunity'); END IF;

  IF EXISTS (SELECT 1 FROM oe_matches m WHERE m.user_id = v_uid AND m.opportunity_id = p_opportunity) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT count(*) INTO v_asks FROM job_queue j
   WHERE j.user_id = v_uid AND j.job_type = 'oe_judge_member'
     AND COALESCE((j.payload->>'on_ask')::boolean, false)
     AND j.created_at >= now() - interval '1 day';
  IF v_asks >= 20 THEN RETURN jsonb_build_object('ok', false, 'reason', 'daily_limit'); END IF;

  -- One live judging job per member is allowed by the queue. When one is
  -- already waiting, the ask joins it instead of being refused.
  SELECT j.id, j.payload->'opportunity_ids' INTO v_job, v_ids
    FROM job_queue j
   WHERE j.user_id = v_uid AND j.job_type = 'oe_judge_member'
     AND j.status IN ('pending','claimed')
   LIMIT 1;

  IF v_job IS NOT NULL THEN
    IF jsonb_typeof(v_ids) = 'array' THEN
      UPDATE job_queue
         SET payload = jsonb_set(payload, '{opportunity_ids}',
               (SELECT jsonb_agg(DISTINCT e) FROM jsonb_array_elements(v_ids || to_jsonb(p_opportunity::text)) e)),
             priority = 5, updated_at = now()
       WHERE id = v_job;
    END IF;
    RETURN jsonb_build_object('ok', true, 'queued', true, 'job_id', v_job);
  END IF;

  INSERT INTO job_queue (job_type, user_id, payload, priority, max_attempts)
  VALUES ('oe_judge_member', v_uid,
          jsonb_build_object('user_id', v_uid, 'opportunity_ids', jsonb_build_array(p_opportunity::text), 'on_ask', true),
          5, 2)
  RETURNING id INTO v_job;

  RETURN jsonb_build_object('ok', true, 'queued', true, 'job_id', v_job);
END $function$;

REVOKE ALL ON FUNCTION public.oe_app_check_now(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_app_check_now(uuid) TO authenticated;

-- ── B2. The country list for the place picker ─────────────────────────────
CREATE OR REPLACE FUNCTION public.oe_ref_country_list()
RETURNS TABLE(iso2 text, name_en text, name_ar text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.iso2, c.name_en, c.name_ar FROM oe_ref_countries c ORDER BY c.name_en
$function$;

GRANT EXECUTE ON FUNCTION public.oe_ref_country_list() TO authenticated;

-- ── B2. Open to remote roles ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.oe_remote_save(p_ok boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  INSERT INTO oe_eligibility (user_id, remote_ok)
  VALUES (v_uid, COALESCE(p_ok, false))
  ON CONFLICT (user_id) DO UPDATE SET remote_ok = EXCLUDED.remote_ok;
  RETURN jsonb_build_object('ok', true, 'remote_ok', COALESCE(p_ok, false));
END $function$;

REVOKE ALL ON FUNCTION public.oe_remote_save(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_remote_save(boolean) TO authenticated;

-- ── A3. Delivery: one a day, three in any seven days, shown as it passes ──
UPDATE oe_policy_versions
   SET params = params
     || jsonb_build_object('cards_per_day', 1, 'cards_per_week', 3, 'delivery_cadence', 'daily')
 WHERE active;

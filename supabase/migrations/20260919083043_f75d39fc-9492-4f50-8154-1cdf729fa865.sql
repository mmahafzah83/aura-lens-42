CREATE TABLE IF NOT EXISTS public.oe_refresh_marks (
  user_id uuid PRIMARY KEY,
  last_refresh_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.oe_refresh_marks TO authenticated;
GRANT ALL ON public.oe_refresh_marks TO service_role;
ALTER TABLE public.oe_refresh_marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own refresh mark" ON public.oe_refresh_marks
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.oe_app_refresh()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_last timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT last_refresh_at INTO v_last FROM oe_refresh_marks WHERE user_id = v_uid;
  IF v_last IS NOT NULL AND v_last > now() - interval '1 minute' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'too_soon',
      'retry_after_seconds', ceil(extract(epoch FROM (v_last + interval '1 minute') - now()))::int);
  END IF;
  INSERT INTO oe_refresh_marks(user_id, last_refresh_at) VALUES (v_uid, now())
    ON CONFLICT (user_id) DO UPDATE SET last_refresh_at = now();

  -- Ask the reader to look again for this member. The worker claims it within
  -- the minute; nothing here waits on it.
  IF NOT EXISTS (
    SELECT 1 FROM job_queue
    WHERE job_type = 'oe_judge_member' AND user_id = v_uid AND status IN ('pending','claimed')
  ) THEN
    INSERT INTO job_queue(job_type, user_id, payload, status, priority)
    VALUES ('oe_judge_member', v_uid, jsonb_build_object('user_id', v_uid, 'on_demand', true), 'pending', 1);
  END IF;

  PERFORM public.oe_refresh_purpose(v_uid);
  RETURN jsonb_build_object('ok', true, 'queue', public.oe_app_queue());
END $function$;
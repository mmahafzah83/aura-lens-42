CREATE OR REPLACE FUNCTION public.oe_enqueue_judging_on_alive()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  IF NOT NEW.alive THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.alive THEN RETURN NEW; END IF;
  FOR r IN
    SELECT DISTINCT c.user_id FROM public.oe_consents c
    WHERE c.kind = 'matching' AND c.revoked_at IS NULL
      AND (SELECT count(DISTINCT f.face) FROM public.oe_faces f WHERE f.user_id = c.user_id) >= 5
      -- debounce: at most one judging job per member per 30 minutes
      AND NOT EXISTS (SELECT 1 FROM public.job_queue j WHERE j.job_type='oe_judge_member'
                      AND j.user_id = c.user_id AND j.created_at > now() - interval '30 minutes')
  LOOP
    BEGIN
      INSERT INTO public.job_queue(job_type, user_id, payload, priority, max_attempts)
      VALUES ('oe_judge_member', r.user_id, '{"lane":"fresh","reason":"new_opportunity"}'::jsonb, 9, 2);
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
  RETURN NEW;
END $function$;
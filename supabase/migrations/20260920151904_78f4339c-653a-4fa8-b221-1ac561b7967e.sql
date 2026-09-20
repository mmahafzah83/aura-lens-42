-- The moment a record goes live it queues itself for judging. No poller, no asking.
CREATE OR REPLACE FUNCTION public.oe_enqueue_judging_on_alive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NOT NEW.alive THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.alive THEN RETURN NEW; END IF;

  FOR r IN
    SELECT DISTINCT c.user_id FROM public.oe_consents c
    WHERE c.kind = 'matching' AND c.revoked_at IS NULL
      AND (SELECT count(DISTINCT f.face) FROM public.oe_faces f WHERE f.user_id = c.user_id) >= 5
  LOOP
    BEGIN
      INSERT INTO public.job_queue(job_type, user_id, payload, priority, max_attempts)
      VALUES ('oe_judge_member', r.user_id, '{}'::jsonb, 2, 2);
    EXCEPTION WHEN unique_violation THEN NULL;  -- one live job per member is the rule
    END;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.oe_enqueue_judging_on_alive() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_oe_enqueue_judging_on_alive ON public.oe_opportunities;
CREATE TRIGGER trg_oe_enqueue_judging_on_alive
  AFTER INSERT OR UPDATE OF alive ON public.oe_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.oe_enqueue_judging_on_alive();

CREATE TABLE public.job_queue (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type       text        NOT NULL,
  user_id        uuid        NOT NULL,
  payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status         text        NOT NULL DEFAULT 'pending',
  priority       int         NOT NULL DEFAULT 0,
  attempts       int         NOT NULL DEFAULT 0,
  max_attempts   int         NOT NULL DEFAULT 3,
  claimed_at     timestamptz,
  claimed_by     text,
  scheduled_for  timestamptz NOT NULL DEFAULT now(),
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_queue_status_chk CHECK (status IN ('pending','claimed','done','failed','dead'))
);

GRANT ALL ON public.job_queue TO service_role;

ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only.

CREATE UNIQUE INDEX job_queue_one_live
  ON public.job_queue (job_type, user_id)
  WHERE status IN ('pending','claimed');

CREATE INDEX job_queue_claimable
  ON public.job_queue (job_type, status, priority DESC, scheduled_for);

CREATE TRIGGER job_queue_set_updated_at
  BEFORE UPDATE ON public.job_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_job(p_job_type text, p_worker text)
RETURNS SETOF public.job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.job_queue
    WHERE job_type = p_job_type
      AND status = 'pending'
      AND scheduled_for <= now()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.job_queue q
  SET status = 'claimed',
      claimed_at = now(),
      claimed_by = p_worker,
      attempts = q.attempts + 1,
      updated_at = now()
  FROM picked
  WHERE q.id = picked.id
  RETURNING q.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_job(p_id uuid, p_success boolean, p_error text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
  v_max int;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max
  FROM public.job_queue WHERE id = p_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF p_success THEN
    UPDATE public.job_queue
    SET status = 'done', last_error = NULL, updated_at = now()
    WHERE id = p_id;
  ELSIF v_attempts >= v_max THEN
    UPDATE public.job_queue
    SET status = 'dead', last_error = p_error, updated_at = now()
    WHERE id = p_id;
  ELSE
    UPDATE public.job_queue
    SET status = 'pending',
        last_error = p_error,
        scheduled_for = now() + (interval '1 minute' * power(3, v_attempts)),
        updated_at = now()
    WHERE id = p_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_job(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_job(uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_job(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_job(uuid, boolean, text) TO service_role;

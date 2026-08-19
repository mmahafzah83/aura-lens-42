CREATE TABLE public.read_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  operation text NOT NULL DEFAULT 'linkedin_read',
  fingerprint_hash text,
  anon_token text,
  notified_at timestamptz
);

CREATE INDEX read_queue_requested_at_idx ON public.read_queue (requested_at);
CREATE INDEX read_queue_notified_idx ON public.read_queue (notified_at);

GRANT ALL ON public.read_queue TO service_role;

ALTER TABLE public.read_queue ENABLE ROW LEVEL SECURITY;

-- no public read, no public write: the only way in is the definer function below
CREATE OR REPLACE FUNCTION public.join_read_queue(
  p_email text,
  p_operation text DEFAULT 'linkedin_read',
  p_anon_token text DEFAULT NULL,
  p_fingerprint_hash text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pos integer;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'INVALID_EMAIL';
  END IF;

  SELECT id INTO v_id FROM public.read_queue
   WHERE lower(email) = lower(p_email) AND notified_at IS NULL
   ORDER BY requested_at LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.read_queue (email, operation, anon_token, fingerprint_hash)
    VALUES (lower(p_email), coalesce(p_operation, 'linkedin_read'), p_anon_token, p_fingerprint_hash)
    RETURNING id INTO v_id;
  END IF;

  SELECT count(*) INTO v_pos
    FROM public.read_queue q
   WHERE q.notified_at IS NULL
     AND q.requested_at <= (SELECT requested_at FROM public.read_queue WHERE id = v_id);

  RETURN v_pos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_read_queue(text, text, text, text) TO anon, authenticated;
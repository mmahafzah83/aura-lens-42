CREATE OR REPLACE FUNCTION public.check_invite_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sent_at timestamptz;
  v_found boolean := false;
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  SELECT true,
         CASE WHEN u.confirmation_token = p_token THEN u.confirmation_sent_at
              ELSE u.recovery_sent_at END
    INTO v_found, v_sent_at
    FROM auth.users u
   WHERE (u.confirmation_token = p_token AND u.confirmation_token <> '')
      OR (u.recovery_token = p_token AND u.recovery_token <> '')
   LIMIT 1;

  IF NOT COALESCE(v_found, false) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_sent_at IS NULL OR v_sent_at < now() - interval '24 hours' THEN
    RETURN jsonb_build_object('status', 'expired');
  END IF;

  RETURN jsonb_build_object('status', 'valid');
END;
$$;

REVOKE ALL ON FUNCTION public.check_invite_token(text) FROM public;
REVOKE ALL ON FUNCTION public.check_invite_token(text) FROM anon;
REVOKE ALL ON FUNCTION public.check_invite_token(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_invite_token(text) TO service_role;
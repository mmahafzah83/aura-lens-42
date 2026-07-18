CREATE OR REPLACE FUNCTION public.bump_signal_engagement(p_signal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_signal_id IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.signal_engagements (user_id, signal_id, open_count, last_opened_at)
  VALUES (v_uid, p_signal_id, 1, now())
  ON CONFLICT (user_id, signal_id)
  DO UPDATE SET open_count = public.signal_engagements.open_count + 1,
                last_opened_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.bump_signal_engagement(uuid) TO authenticated;
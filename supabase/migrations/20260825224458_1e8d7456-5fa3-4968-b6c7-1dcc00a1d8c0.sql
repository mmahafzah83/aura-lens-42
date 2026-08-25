CREATE OR REPLACE FUNCTION public.increment_voice_rule_applied(
  p_rule_id uuid,
  p_applied_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.voice_rules
  SET times_applied = times_applied + 1,
      last_applied_at = p_applied_at
  WHERE id = p_rule_id;
$$;

REVOKE ALL ON FUNCTION public.increment_voice_rule_applied(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_voice_rule_applied(uuid, timestamptz) TO service_role;
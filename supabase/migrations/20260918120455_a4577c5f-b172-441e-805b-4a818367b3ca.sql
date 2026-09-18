REVOKE ALL ON FUNCTION public.oe_warmth_signals(uuid, vector, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_warmth_signals_captures(uuid, vector) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_warmth_issuer_text(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_expected_lead_days(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_warmth_signals(uuid, vector, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.oe_warmth_signals_captures(uuid, vector) TO service_role;
GRANT EXECUTE ON FUNCTION public.oe_warmth_issuer_text(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.oe_expected_lead_days(text, text) TO authenticated, service_role;
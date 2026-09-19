REVOKE ALL ON FUNCTION public.oe_learning_state(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_learning_state(uuid) TO service_role;
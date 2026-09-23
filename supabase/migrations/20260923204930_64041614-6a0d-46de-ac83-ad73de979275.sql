REVOKE EXECUTE ON FUNCTION public.oe_identity_refresh_stmt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.oe_title_level(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.oe_norm_employer(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.voice_window(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.voice_opener_diversity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.voice_window(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.voice_opener_diversity(uuid) TO authenticated, service_role;
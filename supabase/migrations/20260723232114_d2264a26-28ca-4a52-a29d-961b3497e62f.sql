ALTER TABLE public._probe_resp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._probe_resp FROM anon, authenticated;
GRANT ALL ON public._probe_resp TO service_role;
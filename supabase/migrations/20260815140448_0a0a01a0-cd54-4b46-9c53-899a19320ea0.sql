ALTER TABLE public.mirror_reads ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE public.mirror_reads ADD COLUMN IF NOT EXISTS posts_read int;

CREATE OR REPLACE VIEW public.mirror_funnel
WITH (security_invoker = true) AS
SELECT
  (SELECT count(DISTINCT handle) FROM public.mirror_reads) AS completions,
  (SELECT count(*) FROM public.mirror_requests) AS requests,
  (SELECT count(*) FROM public.beta_allowlist WHERE source = 'mirror') AS waitlist_from_mirror,
  round(
    (SELECT count(*) FROM public.beta_allowlist WHERE source = 'mirror')::numeric
    / nullif((SELECT count(DISTINCT handle) FROM public.mirror_reads), 0) * 100
  , 1) AS conversion_pct;

GRANT SELECT ON public.mirror_funnel TO authenticated;
GRANT SELECT ON public.mirror_funnel TO service_role;
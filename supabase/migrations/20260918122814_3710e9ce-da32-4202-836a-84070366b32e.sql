DROP INDEX IF EXISTS public.oe_candidates_canonical_url_idx;
CREATE UNIQUE INDEX oe_candidates_canonical_url_idx ON public.oe_candidates (canonical_url);
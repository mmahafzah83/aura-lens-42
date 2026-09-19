-- F4: oe-harvest upserts with ON CONFLICT (canonical_url) but no such constraint existed.
ALTER TABLE public.oe_candidates
  ADD CONSTRAINT oe_candidates_canonical_url_key UNIQUE (canonical_url);
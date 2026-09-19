ALTER TABLE public.oe_entities ADD COLUMN IF NOT EXISTS resolve_detail jsonb;
COMMENT ON COLUMN public.oe_entities.resolve_detail IS 'Probe record: doors tried with HTTP status, final URL, body byte length, robots permission, and api_probe outcome.';
CREATE INDEX IF NOT EXISTS idx_oe_entities_resolve_status_error ON public.oe_entities (resolve_status, resolve_error);
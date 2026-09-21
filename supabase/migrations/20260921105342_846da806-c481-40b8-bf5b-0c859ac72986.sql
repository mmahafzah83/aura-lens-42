ALTER TABLE public.oe_feeds ADD COLUMN IF NOT EXISTS access_detail jsonb;
ALTER TABLE public.oe_entities ADD COLUMN IF NOT EXISTS sector_code text;
ALTER TABLE public.oe_policy_versions ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.oe_investigations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'member_gap';
ALTER TABLE public.oe_investigations ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE public.oe_investigations ADD COLUMN IF NOT EXISTS detail jsonb;

ALTER TABLE public.oe_investigations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.oe_investigations ALTER COLUMN opportunity_id DROP NOT NULL;
ALTER TABLE public.oe_investigations ALTER COLUMN field DROP NOT NULL;

ALTER TABLE public.oe_investigations DROP CONSTRAINT IF EXISTS oe_investigations_shape_check;
ALTER TABLE public.oe_investigations ADD CONSTRAINT oe_investigations_shape_check CHECK (
  (kind = 'member_gap' AND user_id IS NOT NULL AND opportunity_id IS NOT NULL AND field IS NOT NULL)
  OR (kind <> 'member_gap' AND source IS NOT NULL AND detail IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS oe_investigations_kind_idx ON public.oe_investigations (kind, source);
CREATE INDEX IF NOT EXISTS oe_entities_sector_code_idx ON public.oe_entities (sector_code);
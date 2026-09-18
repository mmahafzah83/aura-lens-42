ALTER TABLE public.oe_opportunities
  ADD COLUMN IF NOT EXISTS level_band text;

ALTER TABLE public.oe_opportunities
  DROP CONSTRAINT IF EXISTS oe_opportunities_level_band_check;

ALTER TABLE public.oe_opportunities
  ADD CONSTRAINT oe_opportunities_level_band_check
  CHECK (level_band IS NULL OR level_band = ANY (ARRAY['ic','manager','senior_manager','director','senior_director','vp','c_suite','board']));

CREATE INDEX IF NOT EXISTS oe_opportunities_level_band_idx
  ON public.oe_opportunities (level_band) WHERE alive;

COMMENT ON COLUMN public.oe_opportunities.seniority_band IS 'Chair grouping vocabulary only (work/table/room). Never used by the eligibility level screen.';
COMMENT ON COLUMN public.oe_opportunities.level_band IS 'Ordered level ladder: ic < manager < senior_manager < director < senior_director < vp < c_suite < board. Null means unknown and always passes the level screen.';
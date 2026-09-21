ALTER TABLE public.oe_opportunity_kinds
  ADD COLUMN IF NOT EXISTS level_gate_applies boolean NOT NULL DEFAULT true;

UPDATE public.oe_opportunity_kinds
   SET level_gate_applies = (code IN ('executive_role','board_seat','advisory_role','executive_teaching','mandate_tender'));

COMMENT ON COLUMN public.oe_opportunity_kinds.level_gate_applies IS
  'True only for kinds that carry a seat with a grade. When false the level gate is skipped and recorded as not_applicable.';
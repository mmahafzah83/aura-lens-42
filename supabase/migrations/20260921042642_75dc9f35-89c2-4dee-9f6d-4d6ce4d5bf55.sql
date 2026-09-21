ALTER TABLE public.oe_matches DROP CONSTRAINT IF EXISTS oe_matches_level_direction_check;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_level_direction_check
  CHECK (level_direction IS NULL OR level_direction = ANY (ARRAY['below','lateral','one_above','two_plus','unknown','not_applicable']));
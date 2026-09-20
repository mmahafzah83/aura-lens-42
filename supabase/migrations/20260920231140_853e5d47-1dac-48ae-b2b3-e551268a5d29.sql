ALTER TABLE public.oe_matches
  ADD COLUMN IF NOT EXISTS eligibility_conditions text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.oe_matches
  ADD COLUMN IF NOT EXISTS write_tests jsonb,
  ADD COLUMN IF NOT EXISTS standing_overlap numeric;

COMMENT ON COLUMN public.oe_matches.write_tests IS 'The four writing tests, each with a pass flag and the sentence that decided it. lane_final = write only when all four are true.';
COMMENT ON COLUMN public.oe_matches.standing_overlap IS 'Cosine overlap between the record subject and the cited evidence sentence.';
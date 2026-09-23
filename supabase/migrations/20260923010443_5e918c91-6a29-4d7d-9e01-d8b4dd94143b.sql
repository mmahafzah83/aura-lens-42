ALTER TABLE public.oe_matches DROP CONSTRAINT IF EXISTS oe_matches_screen_gate_check;
ALTER TABLE public.oe_matches ADD CONSTRAINT oe_matches_screen_gate_check
  CHECK (screen_gate IS NULL OR screen_gate = ANY (ARRAY[
    'place','nationality','licence','certification','clearance','language','other',
    'profession','level','presentation','scored','rubric','employer','issuer'
  ]::text[]));
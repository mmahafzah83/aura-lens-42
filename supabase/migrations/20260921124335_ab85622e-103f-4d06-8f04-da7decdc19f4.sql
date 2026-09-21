ALTER TABLE public.oe_matches ADD COLUMN IF NOT EXISTS gate_note text;

DELETE FROM public.oe_serves WHERE opportunity_id IS NULL;
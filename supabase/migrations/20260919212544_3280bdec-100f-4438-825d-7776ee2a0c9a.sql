ALTER TABLE public.oe_entities DROP CONSTRAINT IF EXISTS oe_entities_resolve_status_check;
ALTER TABLE public.oe_entities ADD CONSTRAINT oe_entities_resolve_status_check
  CHECK (resolve_status = ANY (ARRAY['new','resolved','no_careers','no_ats','failed','invalid_seed']));
ALTER TABLE public.oe_opportunities ADD COLUMN IF NOT EXISTS people_read_at timestamptz;
COMMENT ON COLUMN public.oe_opportunities.people_read_at IS 'When the stored page text was read for the people it names. Null = not read yet.';

ALTER TABLE public.oe_issuer_people ADD COLUMN IF NOT EXISTS quote text;
ALTER TABLE public.oe_issuer_people ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.oe_opportunities(id) ON DELETE SET NULL;
ALTER TABLE public.oe_issuer_people ADD COLUMN IF NOT EXISTS role_in_matter boolean NOT NULL DEFAULT false;
ALTER TABLE public.oe_issuer_people ADD COLUMN IF NOT EXISTS role_in_matter_reason text;
COMMENT ON COLUMN public.oe_issuer_people.quote IS 'The verbatim run from the source page that named this person.';
COMMENT ON COLUMN public.oe_issuer_people.role_in_matter IS 'True only when the page states this person''s part in the matter announced.';
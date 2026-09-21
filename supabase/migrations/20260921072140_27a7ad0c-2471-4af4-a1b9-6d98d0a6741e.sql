ALTER TABLE public.oe_issuer_people
  ALTER COLUMN role_title SET NOT NULL,
  ALTER COLUMN quote SET NOT NULL;

ALTER TABLE public.oe_issuer_people
  ADD CONSTRAINT oe_issuer_people_quote_shows_name
    CHECK (position(lower(full_name) in lower(quote)) > 0),
  ADD CONSTRAINT oe_issuer_people_quote_shows_role
    CHECK (position(lower(role_title) in lower(quote)) > 0);
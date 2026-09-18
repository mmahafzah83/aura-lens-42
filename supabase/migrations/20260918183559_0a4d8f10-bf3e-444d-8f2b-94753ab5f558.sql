
DROP INDEX IF EXISTS public.oe_serves_card_key;
CREATE UNIQUE INDEX oe_serves_card_key ON public.oe_serves (card_id);

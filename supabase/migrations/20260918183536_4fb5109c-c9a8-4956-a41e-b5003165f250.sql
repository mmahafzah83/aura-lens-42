
CREATE UNIQUE INDEX IF NOT EXISTS oe_taps_card_tap_key ON public.oe_taps (card_id, tap);
CREATE UNIQUE INDEX IF NOT EXISTS oe_serves_card_key ON public.oe_serves (card_id) WHERE card_id IS NOT NULL;

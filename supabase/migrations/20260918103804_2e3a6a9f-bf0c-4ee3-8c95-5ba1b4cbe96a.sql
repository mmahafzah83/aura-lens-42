CREATE UNIQUE INDEX IF NOT EXISTS oe_cards_one_unsent_per_day
  ON public.oe_cards (user_id, card_date)
  WHERE sent_at IS NULL;
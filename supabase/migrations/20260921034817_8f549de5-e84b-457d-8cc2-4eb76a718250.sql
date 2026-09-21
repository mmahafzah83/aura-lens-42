ALTER TABLE public.oe_learning_events DROP CONSTRAINT oe_learning_events_process_check;
ALTER TABLE public.oe_learning_events ADD CONSTRAINT oe_learning_events_process_check
  CHECK (process = ANY (ARRAY['stated_preference'::text, 'source_quality'::text, 'learned_ranking'::text, 'card_withheld'::text]));

UPDATE public.oe_cards c
SET fit_band = m.fit_band, win_band = m.win_band, match_id = COALESCE(c.match_id, m.id)
FROM public.oe_matches m
WHERE m.user_id = c.user_id
  AND m.opportunity_id = c.opportunity_id
  AND c.opportunity_id IS NOT NULL
  AND c.fit_band IS NULL
  AND m.fit_band IS NOT NULL;

INSERT INTO public.oe_learning_events (user_id, process, trigger_reason, detail, applied)
SELECT c.user_id, 'card_withheld', 'no_band_on_match',
       jsonb_build_object('card_id', c.id, 'card_date', c.card_date, 'lane', c.lane,
                          'opportunity_id', c.opportunity_id, 'backfill', true),
       false
FROM public.oe_cards c
WHERE c.fit_band IS NULL AND c.sent_at IS NULL;

DELETE FROM public.oe_serves s
USING public.oe_cards c
WHERE s.card_id = c.id AND c.fit_band IS NULL AND c.sent_at IS NULL;

DELETE FROM public.oe_cards c
WHERE c.fit_band IS NULL AND c.sent_at IS NULL;
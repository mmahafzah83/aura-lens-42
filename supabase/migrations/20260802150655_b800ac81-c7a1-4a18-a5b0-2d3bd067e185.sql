ALTER TABLE public.deck_events ADD COLUMN IF NOT EXISTS pdf_bytes bigint;
ALTER TABLE public.deck_events DROP CONSTRAINT IF EXISTS deck_events_event_check;
ALTER TABLE public.deck_events ADD CONSTRAINT deck_events_event_check CHECK (event = ANY (ARRAY['generated','validation_failed','rendered','exported','export_failed','published','publish_failed','abandoned']));
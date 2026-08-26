ALTER TABLE public.notification_events DROP CONSTRAINT IF EXISTS notification_events_type_check;
ALTER TABLE public.notification_events ADD CONSTRAINT notification_events_type_check
  CHECK (type = ANY (ARRAY['timing_window'::text,'silence_alarm'::text,'signal_shift'::text,'weekly_brief'::text,'knowledge_debt'::text,'morning_signal'::text,'member_reminder'::text]));
-- Enable realtime for intelligence-related tables so KPI counters update live
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='strategic_signals') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.strategic_signals;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='recommended_moves') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recommended_moves;
  END IF;
END $$;

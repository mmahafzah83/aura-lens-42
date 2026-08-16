ALTER TABLE public.diagnostic_profiles ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'read';
ALTER TABLE public.diagnostic_profiles DROP CONSTRAINT IF EXISTS diagnostic_profiles_tier_check;
ALTER TABLE public.diagnostic_profiles ADD CONSTRAINT diagnostic_profiles_tier_check CHECK (tier IN ('read','loop'));
UPDATE public.diagnostic_profiles SET tier = 'loop';
CREATE INDEX IF NOT EXISTS diagnostic_profiles_tier_idx ON public.diagnostic_profiles (tier);
DO $$
DECLARE n_loop int; n_read int;
BEGIN
  SELECT count(*) INTO n_loop FROM public.diagnostic_profiles WHERE tier = 'loop';
  SELECT count(*) INTO n_read FROM public.diagnostic_profiles WHERE tier = 'read';
  RAISE NOTICE 'tier backfill: loop=%, read=%', n_loop, n_read;
  IF n_read > 0 THEN RAISE EXCEPTION 'backfill failed: % rows still read', n_read; END IF;
END $$;
ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS composer_sort_pref text;

ALTER TABLE public.diagnostic_profiles
  DROP CONSTRAINT IF EXISTS diagnostic_profiles_composer_sort_pref_check;

ALTER TABLE public.diagnostic_profiles
  ADD CONSTRAINT diagnostic_profiles_composer_sort_pref_check
  CHECK (composer_sort_pref IS NULL OR composer_sort_pref IN ('recommended','newest','most_evidence','never_written'));
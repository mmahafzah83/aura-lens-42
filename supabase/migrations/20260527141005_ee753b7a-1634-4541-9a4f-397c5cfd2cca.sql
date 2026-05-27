ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS audit_method text;

UPDATE public.diagnostic_profiles
SET audit_completed_at = COALESCE(created_at, now()),
    audit_method = 'self_calibration'
WHERE skill_ratings IS NOT NULL
  AND skill_ratings::text <> '{}'
  AND skill_ratings::text <> 'null'
  AND audit_completed_at IS NULL;
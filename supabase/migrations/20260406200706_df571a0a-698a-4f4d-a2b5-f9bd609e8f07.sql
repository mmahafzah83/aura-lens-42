ALTER TABLE public.diagnostic_profiles 
ADD COLUMN IF NOT EXISTS audit_results jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS audit_interpretation text,
ADD COLUMN IF NOT EXISTS audit_completed_at timestamp with time zone;
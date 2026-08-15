ALTER TABLE public.mirror_requests ADD COLUMN IF NOT EXISTS ref text;
ALTER TABLE public.mirror_reads ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.mirror_reads ADD COLUMN IF NOT EXISTS emailed_to text;
ALTER TABLE public.beta_allowlist ADD COLUMN IF NOT EXISTS ref text;
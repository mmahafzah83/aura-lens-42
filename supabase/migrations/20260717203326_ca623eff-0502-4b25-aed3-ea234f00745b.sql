ALTER TABLE public.ops_alerts
  ADD COLUMN IF NOT EXISTS what   text,
  ADD COLUMN IF NOT EXISTS impact text,
  ADD COLUMN IF NOT EXISTS action text;
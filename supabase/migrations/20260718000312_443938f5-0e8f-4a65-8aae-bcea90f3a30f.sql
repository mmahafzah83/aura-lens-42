ALTER TABLE public.ops_alerts
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS resolved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS occurrences  int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_emailed timestamptz;
CREATE INDEX IF NOT EXISTS ops_alerts_open_source_idx ON public.ops_alerts (source) WHERE status = 'open';
UPDATE public.ops_alerts SET status='resolved', resolved_at=COALESCE(resolved_at, created_at) WHERE status='open';
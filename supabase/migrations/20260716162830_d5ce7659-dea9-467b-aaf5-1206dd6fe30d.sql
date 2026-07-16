
ALTER TABLE public.linkedin_connections
  ADD COLUMN IF NOT EXISTS followers_total integer,
  ADD COLUMN IF NOT EXISTS followers_total_at timestamptz;

ALTER TABLE public.influence_snapshots
  ALTER COLUMN followers DROP DEFAULT;

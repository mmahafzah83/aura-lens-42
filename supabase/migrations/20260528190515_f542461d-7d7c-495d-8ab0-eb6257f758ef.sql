ALTER TABLE public.audience_demographics
  ADD COLUMN IF NOT EXISTS period_start date,
  ADD COLUMN IF NOT EXISTS period_end date,
  ADD COLUMN IF NOT EXISTS upload_batch_id uuid;

ALTER TABLE public.influence_snapshots
  ADD COLUMN IF NOT EXISTS members_reached integer,
  ADD COLUMN IF NOT EXISTS total_impressions_annual integer;
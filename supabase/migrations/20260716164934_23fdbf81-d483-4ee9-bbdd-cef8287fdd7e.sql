ALTER TABLE public.influence_snapshots DROP CONSTRAINT IF EXISTS influence_snapshots_user_id_snapshot_date_key;
UPDATE public.influence_snapshots SET source_type = 'unknown' WHERE source_type IS NULL;
ALTER TABLE public.influence_snapshots ALTER COLUMN source_type SET DEFAULT 'unknown';
ALTER TABLE public.influence_snapshots ALTER COLUMN source_type SET NOT NULL;
ALTER TABLE public.influence_snapshots ADD CONSTRAINT influence_snapshots_user_id_snapshot_date_source_type_key UNIQUE (user_id, snapshot_date, source_type);
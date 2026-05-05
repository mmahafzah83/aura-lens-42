ALTER TABLE public.user_milestones ADD COLUMN IF NOT EXISTS acknowledged boolean NOT NULL DEFAULT false;
ALTER TABLE public.user_milestones ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;
ALTER TABLE public.score_snapshots ADD COLUMN IF NOT EXISTS tier text;
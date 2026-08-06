ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS edit_distance numeric,
  ADD COLUMN IF NOT EXISTS unsourced_entities_removed integer NOT NULL DEFAULT 0;
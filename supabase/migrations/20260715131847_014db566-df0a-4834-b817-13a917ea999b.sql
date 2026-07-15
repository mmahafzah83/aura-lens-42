ALTER TABLE public.linkedin_post_metrics
  ADD COLUMN IF NOT EXISTS members_reached integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sends integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS link_clicks integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followers_gained integer NOT NULL DEFAULT 0;
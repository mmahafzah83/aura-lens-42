-- Add tracking_status to linkedin_posts
ALTER TABLE public.linkedin_posts ADD COLUMN IF NOT EXISTS tracking_status text NOT NULL DEFAULT 'discovered';

-- Add source_type to linkedin_post_metrics
ALTER TABLE public.linkedin_post_metrics ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'manual';

-- Add source tracking to linkedin_posts
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'search_discovery',
  ADD COLUMN IF NOT EXISTS source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enriched_by text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_trust integer NOT NULL DEFAULT 1;

-- Set source_trust defaults based on source_type for existing rows
-- search_discovery = 1, manual_import = 2, manual_url = 2, browser_capture = 3
COMMENT ON COLUMN public.linkedin_posts.source_type IS 'Primary source: search_discovery, manual_import, manual_url, browser_capture';
COMMENT ON COLUMN public.linkedin_posts.enriched_by IS 'Array of source_types that contributed data to this record';
COMMENT ON COLUMN public.linkedin_posts.source_trust IS 'Trust priority: 1=search_discovery, 2=manual_import/manual_url, 3=browser_capture';

-- Create unique index on post_url for canonical dedup (partial - only non-null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_linkedin_posts_canonical_url
  ON public.linkedin_posts (user_id, post_url)
  WHERE post_url IS NOT NULL;

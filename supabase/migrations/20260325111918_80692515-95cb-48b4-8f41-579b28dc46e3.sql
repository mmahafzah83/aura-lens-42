
-- Create linkedin_posts table for individual post records
CREATE TABLE public.linkedin_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  linkedin_post_id text NOT NULL,
  post_text text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  published_at timestamp with time zone,
  like_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  repost_count integer NOT NULL DEFAULT 0,
  engagement_score numeric NOT NULL DEFAULT 0,
  media_type text DEFAULT 'text',
  theme text,
  tone text,
  format_type text,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, linkedin_post_id)
);

-- Enable RLS
ALTER TABLE public.linkedin_posts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own linkedin posts" ON public.linkedin_posts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own linkedin posts" ON public.linkedin_posts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own linkedin posts" ON public.linkedin_posts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own linkedin posts" ON public.linkedin_posts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_linkedin_posts_user_id ON public.linkedin_posts (user_id);
CREATE INDEX idx_linkedin_posts_published_at ON public.linkedin_posts (user_id, published_at DESC);

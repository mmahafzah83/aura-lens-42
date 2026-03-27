
-- Extend linkedin_connections with additional profile fields
ALTER TABLE public.linkedin_connections
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS profile_name text,
  ADD COLUMN IF NOT EXISTS profile_url text,
  ADD COLUMN IF NOT EXISTS source_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS timezone text;

-- Extend linkedin_posts with content analysis fields
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS post_url text,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS hook text,
  ADD COLUMN IF NOT EXISTS topic_label text,
  ADD COLUMN IF NOT EXISTS framework_type text,
  ADD COLUMN IF NOT EXISTS visual_style text,
  ADD COLUMN IF NOT EXISTS content_type text;

-- Extend influence_snapshots with granular metrics
ALTER TABLE public.influence_snapshots
  ADD COLUMN IF NOT EXISTS impressions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reactions integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saves integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posts_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'sync';

-- Create linkedin_post_metrics for time-series post performance
CREATE TABLE IF NOT EXISTS public.linkedin_post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.linkedin_posts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  impressions integer NOT NULL DEFAULT 0,
  reactions integer NOT NULL DEFAULT 0,
  comments integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  engagement_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, snapshot_date)
);

ALTER TABLE public.linkedin_post_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own post metrics" ON public.linkedin_post_metrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own post metrics" ON public.linkedin_post_metrics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own post metrics" ON public.linkedin_post_metrics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create content_topics for topic taxonomy
CREATE TABLE IF NOT EXISTS public.content_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  label text NOT NULL,
  parent_topic_id uuid REFERENCES public.content_topics(id) ON DELETE SET NULL,
  post_count integer NOT NULL DEFAULT 0,
  avg_engagement numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, label)
);

ALTER TABLE public.content_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own topics" ON public.content_topics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own topics" ON public.content_topics FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own topics" ON public.content_topics FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own topics" ON public.content_topics FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Create sync_runs for sync history tracking
CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.linkedin_connections(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  records_fetched integer NOT NULL DEFAULT 0,
  records_stored integer NOT NULL DEFAULT 0,
  sync_type text NOT NULL DEFAULT 'full',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync runs" ON public.sync_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync runs" ON public.sync_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sync runs" ON public.sync_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Create sync_errors for error tracking
CREATE TABLE IF NOT EXISTS public.sync_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sync_run_id uuid REFERENCES public.sync_runs(id) ON DELETE CASCADE,
  error_type text NOT NULL DEFAULT 'unknown',
  error_message text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync errors" ON public.sync_errors FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sync errors" ON public.sync_errors FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Create import_jobs for CSV/manual import tracking
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  import_type text NOT NULL DEFAULT 'csv',
  filename text,
  status text NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL DEFAULT 0,
  imported_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  error_details jsonb DEFAULT '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own import jobs" ON public.import_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own import jobs" ON public.import_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own import jobs" ON public.import_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Create authority_scores for computed authority metrics
CREATE TABLE IF NOT EXISTS public.authority_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  authority_score numeric NOT NULL DEFAULT 0,
  momentum_score numeric NOT NULL DEFAULT 0,
  consistency_score numeric NOT NULL DEFAULT 0,
  engagement_score numeric NOT NULL DEFAULT 0,
  strategic_resonance_score numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

ALTER TABLE public.authority_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own authority scores" ON public.authority_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own authority scores" ON public.authority_scores FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

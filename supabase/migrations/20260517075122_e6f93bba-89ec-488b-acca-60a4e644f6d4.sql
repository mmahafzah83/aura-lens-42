ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS source_signal_id uuid REFERENCES public.strategic_signals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_linkedin_posts_source_signal_id
  ON public.linkedin_posts(source_signal_id)
  WHERE source_signal_id IS NOT NULL;
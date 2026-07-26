ALTER TABLE public.linkedin_posts ADD COLUMN IF NOT EXISTS original_generated_text text;

CREATE TABLE public.draft_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid,
  language text,
  served_text text,
  published_text text,
  served_chars int,
  published_chars int,
  levenshtein_distance int,
  similarity_ratio numeric,
  first_line_changed boolean,
  numbers_removed int,
  numbers_added int,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.draft_edits TO authenticated;
GRANT ALL ON public.draft_edits TO service_role;

ALTER TABLE public.draft_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own draft edits"
ON public.draft_edits FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_draft_edits_user_created ON public.draft_edits (user_id, created_at DESC);
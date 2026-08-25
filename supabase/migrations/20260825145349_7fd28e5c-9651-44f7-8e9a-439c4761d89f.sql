ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS move_id TEXT,
  ADD COLUMN IF NOT EXISTS beats TEXT[],
  ADD COLUMN IF NOT EXISTS shape_repeat TEXT;

CREATE INDEX IF NOT EXISTS content_items_user_made_created_idx
  ON public.content_items (user_id, made_by, created_at DESC);
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS ending_type text,
  ADD COLUMN IF NOT EXISTS stance text,
  ADD COLUMN IF NOT EXISTS moment_id uuid,
  ADD COLUMN IF NOT EXISTS voice_match numeric;
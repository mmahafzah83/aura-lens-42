ALTER TABLE public.profile_copy_drafts
  ADD COLUMN IF NOT EXISTS copied_at timestamptz,
  ADD COLUMN IF NOT EXISTS copied_text text,
  ADD COLUMN IF NOT EXISTS copied_angle text,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS source_headline text,
  ADD COLUMN IF NOT EXISTS source_about text;
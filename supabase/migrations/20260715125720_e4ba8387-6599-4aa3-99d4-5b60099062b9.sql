ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS pages_total integer,
  ADD COLUMN IF NOT EXISTS pages_read integer,
  ADD COLUMN IF NOT EXISTS extraction_method text;
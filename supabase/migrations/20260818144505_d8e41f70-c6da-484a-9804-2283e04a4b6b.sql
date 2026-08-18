ALTER TABLE public.mirror_reads
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS headline text;
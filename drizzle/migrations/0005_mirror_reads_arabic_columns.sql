ALTER TABLE public.mirror_reads
  ADD COLUMN IF NOT EXISTS read_ar jsonb,
  ADD COLUMN IF NOT EXISTS generated_at_ar timestamptz,
  ADD COLUMN IF NOT EXISTS read_version_ar smallint,
  ADD COLUMN IF NOT EXISTS sparse_ar boolean;
COMMENT ON COLUMN public.mirror_reads.read_ar IS 'The Arabic read for this handle; read/generated_at/read_version/sparse stay the English read.';
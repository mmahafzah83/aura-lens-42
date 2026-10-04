ALTER TABLE public.mirror_reads ALTER COLUMN read DROP NOT NULL;
COMMENT ON COLUMN public.mirror_reads.read IS 'The English read. NULL when only an Arabic read (read_ar) exists for this handle.';
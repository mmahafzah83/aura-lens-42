ALTER TABLE public.mirror_reads ADD COLUMN IF NOT EXISTS comments_read integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.mirror_reads.posts_read IS 'Posts the member wrote in the last 12 months (own text; quote posts count, pure reshares do not).';
COMMENT ON COLUMN public.mirror_reads.comments_read IS 'Comments of 15+ words the member wrote on other people''s posts in the last 12 months.';
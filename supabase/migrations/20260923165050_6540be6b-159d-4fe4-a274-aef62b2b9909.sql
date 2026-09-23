ALTER TABLE public.oe_feeds ADD COLUMN IF NOT EXISTS needs_render boolean NOT NULL DEFAULT false;
UPDATE public.oe_feeds SET links_fingerprint = NULL
WHERE links_fingerprint = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
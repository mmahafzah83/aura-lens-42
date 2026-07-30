ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS display_title text;

-- Backfill: hash-style filenames get a human title from the first sentence of
-- the summary; readable filenames get a cleaned version of the filename.
UPDATE public.documents
SET display_title = left(
  trim(split_part(regexp_replace(coalesce(summary, ''), '[*#`]', '', 'g'), '.', 1)),
  60
)
WHERE display_title IS NULL
  AND filename ~* '^file_[0-9a-f-]{8,}'
  AND coalesce(summary, '') <> '';

UPDATE public.documents
SET display_title = initcap(
  trim(regexp_replace(regexp_replace(filename, '\.[A-Za-z0-9]+$', ''), '[_-]+', ' ', 'g'))
)
WHERE display_title IS NULL
  AND filename IS NOT NULL
  AND filename !~* '^file_[0-9a-f-]{8,}';
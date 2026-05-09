-- 1. Clean duplicate entries (keep oldest), but skip ones referenced elsewhere
DELETE FROM entries a
USING entries b
WHERE a.user_id = b.user_id
  AND a.image_url = b.image_url
  AND a.image_url IS NOT NULL
  AND a.created_at > b.created_at
  AND a.id NOT IN (SELECT entry_id FROM master_frameworks WHERE entry_id IS NOT NULL)
  AND a.id NOT IN (SELECT source_entry_id FROM learned_intelligence WHERE source_entry_id IS NOT NULL);

-- 2. Unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS entries_user_url_unique
ON entries (user_id, image_url)
WHERE image_url IS NOT NULL;

-- 3. Clean bad signals
DELETE FROM strategic_signals
WHERE signal_title IS NULL
   OR btrim(signal_title) = ''
   OR signal_title = 'Untitled Signal';
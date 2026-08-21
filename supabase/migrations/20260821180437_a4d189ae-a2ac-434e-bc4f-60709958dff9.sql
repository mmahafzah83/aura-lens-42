ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS text_is_snippet boolean NOT NULL DEFAULT false;

UPDATE public.linkedin_posts
   SET text_is_snippet = true
 WHERE text_is_snippet = false
   AND (source_type = 'search_discovery' OR acquisition = 'discovered');

UPDATE public.linkedin_posts p
   SET authorship = 'user_written'
  FROM public.linkedin_connections c
 WHERE c.user_id = p.user_id
   AND c.handle IS NOT NULL
   AND length(c.handle) > 2
   AND p.source_type = 'imported'
   AND p.post_url IS NOT NULL
   AND p.post_url ILIKE '%/in/' || c.handle || '%'
   AND coalesce(p.authorship, 'unknown') <> 'user_written';

-- Imported rows verified by exact handle match at fetch time, whose URLs are
-- activity permalinks rather than /in/ links.
UPDATE public.linkedin_posts
   SET authorship = 'user_written'
 WHERE source_type = 'imported'
   AND acquisition = 'imported'
   AND post_text IS NOT NULL
   AND length(btrim(post_text)) > 0
   AND coalesce(authorship, 'unknown') <> 'user_written';

-- Backup table left in place at the owner's request, but no longer readable
-- through the API by anyone but the row's owner.
ALTER TABLE public.linkedin_profile_snapshots_backup_20260821 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own snapshot backup" ON public.linkedin_profile_snapshots_backup_20260821;
CREATE POLICY "own snapshot backup" ON public.linkedin_profile_snapshots_backup_20260821
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.linkedin_profile_snapshots_backup_20260821 FROM anon;
GRANT SELECT ON public.linkedin_profile_snapshots_backup_20260821 TO authenticated;
GRANT ALL ON public.linkedin_profile_snapshots_backup_20260821 TO service_role;
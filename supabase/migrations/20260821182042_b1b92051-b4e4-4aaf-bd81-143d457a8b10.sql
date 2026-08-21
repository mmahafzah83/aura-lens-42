-- Re-verify ownership on imported posts. "Imported" never means "theirs".
WITH corrected AS (
  UPDATE public.linkedin_posts p
     SET authorship = 'unverified'
    FROM public.linkedin_connections c
   WHERE c.user_id = p.user_id
     AND coalesce(btrim(c.handle), '') <> ''
     AND p.source_type = 'imported'
     AND p.authorship = 'user_written'
     AND coalesce(p.post_url, '') NOT ILIKE '%' || c.handle || '%'
  RETURNING p.id
)
SELECT count(*) FROM corrected;
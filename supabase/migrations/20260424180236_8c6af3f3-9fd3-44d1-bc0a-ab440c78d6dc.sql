
-- 1) Fix search_vault to use auth.uid() instead of caller-supplied p_user_id
-- Drop both overloads first
DROP FUNCTION IF EXISTS public.search_vault(uuid, text, integer);
DROP FUNCTION IF EXISTS public.search_vault(uuid, text, integer, vector);

CREATE OR REPLACE FUNCTION public.search_vault(p_query text, p_limit integer DEFAULT 20, p_query_embedding vector DEFAULT NULL::vector)
RETURNS TABLE(source text, id uuid, content text, title text, summary text, skill_pillar text, type text, pinned boolean, created_at timestamp with time zone, rank real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT * FROM (
    SELECT
      'entry'::text AS source,
      e.id,
      e.content,
      e.title,
      e.summary,
      e.skill_pillar,
      e.type,
      e.pinned,
      e.created_at,
      (
        COALESCE(ts_rank(e.tsv, websearch_to_tsquery('english', p_query)), 0) * 0.4
        +
        CASE
          WHEN p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL
          THEN (1.0 - (e.embedding <=> p_query_embedding))::real * 0.6
          ELSE 0
        END
      )::real AS rank
    FROM public.entries e
    WHERE e.user_id = auth.uid()
      AND (
        e.tsv @@ websearch_to_tsquery('english', p_query)
        OR (p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL AND (e.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    SELECT
      'document'::text AS source,
      dc.id,
      dc.content,
      d.filename AS title,
      d.summary,
      NULL AS skill_pillar,
      d.file_type AS type,
      false AS pinned,
      dc.created_at,
      (
        COALESCE(ts_rank(dc.tsv, websearch_to_tsquery('english', p_query)), 0) * 0.4
        +
        CASE
          WHEN p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
          THEN (1.0 - (dc.embedding <=> p_query_embedding))::real * 0.6
          ELSE 0
        END
      )::real AS rank
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    WHERE dc.user_id = auth.uid()
      AND (
        dc.tsv @@ websearch_to_tsquery('english', p_query)
        OR (p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL AND (dc.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    SELECT
      'intelligence'::text AS source,
      li.id,
      li.content,
      li.title,
      li.content AS summary,
      li.skill_pillars[1] AS skill_pillar,
      li.intelligence_type AS type,
      false AS pinned,
      li.created_at,
      (
        COALESCE(ts_rank(li.tsv, websearch_to_tsquery('english', p_query)), 0) * 0.4
        +
        CASE
          WHEN p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL
          THEN (1.0 - (li.embedding <=> p_query_embedding))::real * 0.6
          ELSE 0
        END
      )::real AS rank
    FROM public.learned_intelligence li
    WHERE li.user_id = auth.uid()
      AND (
        li.tsv @@ websearch_to_tsquery('english', p_query)
        OR (p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL AND (li.embedding <=> p_query_embedding) < 0.8)
      )
  ) combined
  ORDER BY rank DESC
  LIMIT p_limit;
$function$;

-- 2) Make unified_content view use security_invoker so it enforces caller's RLS
ALTER VIEW public.unified_content SET (security_invoker = true);

-- 3) Add UPDATE policy for documents storage bucket (owner-scoped)
CREATE POLICY "Users can update own documents files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

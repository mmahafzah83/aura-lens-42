-- Create HNSW indexes (better than ivfflat for small datasets)
CREATE INDEX IF NOT EXISTS entries_embedding_idx ON public.entries
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Replace search_vault with hybrid search
CREATE OR REPLACE FUNCTION public.search_vault(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 20,
  p_query_embedding vector DEFAULT NULL
)
RETURNS TABLE(
  source text,
  id uuid,
  content text,
  title text,
  summary text,
  skill_pillar text,
  type text,
  pinned boolean,
  created_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
    WHERE e.user_id = p_user_id
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
    WHERE dc.user_id = p_user_id
      AND (
        dc.tsv @@ websearch_to_tsquery('english', p_query)
        OR (p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL AND (dc.embedding <=> p_query_embedding) < 0.8)
      )
  ) combined
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
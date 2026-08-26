DROP FUNCTION IF EXISTS public.search_vault(text, integer, vector);
DROP FUNCTION IF EXISTS public.search_vault(uuid, text, integer, vector, text[]);

CREATE INDEX IF NOT EXISTS idx_strategic_signals_tsv
  ON public.strategic_signals
  USING gin (to_tsvector('english', coalesce(signal_title,'') || ' ' || coalesce(explanation,'') || ' ' || coalesce(strategic_implications,'')));

CREATE INDEX IF NOT EXISTS idx_evidence_fragments_embedding
  ON public.evidence_fragments
  USING hnsw (embedding vector_cosine_ops);

CREATE FUNCTION public.search_vault(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 15,
  p_query_embedding vector DEFAULT NULL,
  p_kinds text[] DEFAULT NULL
)
RETURNS TABLE(
  source_kind text,
  source_id uuid,
  title text,
  content text,
  url text,
  occurred_at timestamptz,
  rank real,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  q tsquery;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF (p_query IS NULL OR btrim(p_query) = '') AND p_query_embedding IS NULL THEN
    RETURN;
  END IF;

  q := CASE WHEN p_query IS NULL OR btrim(p_query) = ''
            THEN NULL
            ELSE websearch_to_tsquery('english', p_query) END;

  RETURN QUERY
  SELECT * FROM (
    -- a. document chunks
    SELECT
      'document_chunk'::text AS source_kind,
      dc.id AS source_id,
      d.filename AS title,
      dc.content AS content,
      d.file_url AS url,
      dc.created_at AS occurred_at,
      (
        COALESCE(ts_rank(dc.tsv, q), 0) * 0.4
        + CASE WHEN p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
               THEN (1.0 - (dc.embedding <=> p_query_embedding))::real * 0.6
               ELSE 0 END
      )::real AS rank,
      jsonb_build_object(
        'chunk_index', dc.chunk_index,
        'page', dc.metadata -> 'page',
        'document_id', dc.document_id,
        'pipeline_version', dc.pipeline_version
      ) AS metadata
    FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE dc.user_id = p_user_id
      AND (p_kinds IS NULL OR 'document_chunk' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND dc.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
            AND (dc.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- b. evidence fragments
    SELECT
      'evidence_fragment'::text,
      ef.id,
      ef.title,
      ef.content,
      NULL::text,
      ef.created_at,
      (
        COALESCE(ts_rank(ef.tsv, q), 0) * 0.4
        + CASE WHEN p_query_embedding IS NOT NULL AND ef.embedding IS NOT NULL
               THEN (1.0 - (ef.embedding <=> p_query_embedding))::real * 0.6
               ELSE 0 END
      )::real,
      jsonb_build_object(
        'fragment_type', ef.fragment_type,
        'confidence', ef.confidence,
        'skill_pillars', to_jsonb(ef.skill_pillars),
        'tags', to_jsonb(ef.tags),
        'source_registry_id', ef.source_registry_id,
        'pipeline_version', ef.pipeline_version
      )
    FROM public.evidence_fragments ef
    WHERE ef.user_id = p_user_id
      AND (p_kinds IS NULL OR 'evidence_fragment' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND ef.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND ef.embedding IS NOT NULL
            AND (ef.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- c. entries
    SELECT
      'entry'::text,
      e.id,
      e.title,
      COALESCE(e.content, e.summary),
      e.image_url,
      e.created_at,
      (
        COALESCE(ts_rank(e.tsv, q), 0) * 0.4
        + CASE WHEN p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL
               THEN (1.0 - (e.embedding <=> p_query_embedding))::real * 0.6
               ELSE 0 END
      )::real,
      jsonb_build_object(
        'type', e.type,
        'skill_pillar', e.skill_pillar
      )
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND (p_kinds IS NULL OR 'entry' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND e.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL
            AND (e.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- d. strategic signals (keyword half only — no embedding column)
    SELECT
      'signal'::text,
      s.id,
      s.signal_title,
      concat_ws(' ', s.explanation, s.strategic_implications),
      NULL::text,
      s.created_at,
      (
        COALESCE(
          ts_rank(
            to_tsvector('english',
              coalesce(s.signal_title,'') || ' ' ||
              coalesce(s.explanation,'') || ' ' ||
              coalesce(s.strategic_implications,'')),
            q),
          0) * 0.4
      )::real,
      jsonb_build_object(
        'confidence', s.confidence,
        'priority_score', s.priority_score,
        'theme_tags', to_jsonb(s.theme_tags),
        'status', s.status,
        'velocity_status', s.velocity_status,
        'pipeline_version', s.pipeline_version
      )
    FROM public.strategic_signals s
    WHERE s.user_id = p_user_id
      AND (p_kinds IS NULL OR 'signal' = ANY(p_kinds))
      AND q IS NOT NULL
      AND to_tsvector('english',
            coalesce(s.signal_title,'') || ' ' ||
            coalesce(s.explanation,'') || ' ' ||
            coalesce(s.strategic_implications,'')) @@ q
  ) u
  ORDER BY u.rank DESC
  LIMIT GREATEST(COALESCE(p_limit, 15), 1);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_vault(uuid, text, integer, vector, text[]) TO service_role, authenticated;
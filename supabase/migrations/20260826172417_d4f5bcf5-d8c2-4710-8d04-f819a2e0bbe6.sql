-- Phase 1.6 — hybrid retrieval done right.
-- 1) Signals and posts become first-class searchable (tsv + embedding).
-- 2) search_vault fuses keyword and vector lists with Reciprocal Rank Fusion.

-- ---------------------------------------------------------------- signals
ALTER TABLE public.strategic_signals
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS tsv tsvector;

CREATE OR REPLACE FUNCTION public.strategic_signals_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.signal_title, '') || ' ' ||
    coalesce(NEW.explanation, '') || ' ' ||
    coalesce(NEW.strategic_implications, ''));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS strategic_signals_tsv_update ON public.strategic_signals;
CREATE TRIGGER strategic_signals_tsv_update
  BEFORE INSERT OR UPDATE ON public.strategic_signals
  FOR EACH ROW EXECUTE FUNCTION public.strategic_signals_tsv_trigger();

UPDATE public.strategic_signals
SET tsv = to_tsvector('english',
  coalesce(signal_title, '') || ' ' ||
  coalesce(explanation, '') || ' ' ||
  coalesce(strategic_implications, ''))
WHERE tsv IS NULL;

-- ------------------------------------------------------------------ posts
ALTER TABLE public.linkedin_posts
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS tsv tsvector;

CREATE OR REPLACE FUNCTION public.linkedin_posts_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.hook, '') || ' ' || coalesce(NEW.post_text, ''));
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS linkedin_posts_tsv_update ON public.linkedin_posts;
CREATE TRIGGER linkedin_posts_tsv_update
  BEFORE INSERT OR UPDATE ON public.linkedin_posts
  FOR EACH ROW EXECUTE FUNCTION public.linkedin_posts_tsv_trigger();

UPDATE public.linkedin_posts
SET tsv = to_tsvector('english', coalesce(hook, '') || ' ' || coalesce(post_text, ''))
WHERE tsv IS NULL;

-- ---------------------------------------------------------------- indexes
CREATE INDEX IF NOT EXISTS idx_strategic_signals_tsv_col
  ON public.strategic_signals USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_tsv_col
  ON public.linkedin_posts USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_strategic_signals_embedding
  ON public.strategic_signals USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_linkedin_posts_embedding
  ON public.linkedin_posts USING hnsw (embedding vector_cosine_ops);

-- ----------------------------------------------------------- search_vault
DROP FUNCTION IF EXISTS public.search_vault(uuid, text, integer, vector, text[]);

CREATE FUNCTION public.search_vault(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 15,
  p_query_embedding vector DEFAULT NULL,
  p_kinds text[] DEFAULT NULL,
  p_candidates integer DEFAULT 60
)
RETURNS TABLE(
  source_kind text,
  source_id uuid,
  title text,
  content text,
  url text,
  occurred_at timestamptz,
  rank real,
  kw_rank real,
  vec_distance real,
  rrf real,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  q tsquery;
  k constant integer := 60;   -- standard Reciprocal Rank Fusion constant
  cand integer := GREATEST(COALESCE(p_candidates, 60), 1);
  lim integer := GREATEST(COALESCE(p_limit, 15), 1);
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
  WITH pool AS (
    -- a. document chunks
    SELECT
      'document_chunk'::text AS source_kind,
      dc.id AS source_id,
      d.filename AS title,
      dc.content AS content,
      d.file_url AS url,
      dc.created_at AS occurred_at,
      CASE WHEN q IS NOT NULL AND dc.tsv @@ q THEN ts_rank(dc.tsv, q)::real END AS kw_rank,
      CASE WHEN p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
                AND (dc.embedding <=> p_query_embedding) < 0.8
           THEN (dc.embedding <=> p_query_embedding)::real END AS vec_distance,
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
      CASE WHEN q IS NOT NULL AND ef.tsv @@ q THEN ts_rank(ef.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND ef.embedding IS NOT NULL
                AND (ef.embedding <=> p_query_embedding) < 0.8
           THEN (ef.embedding <=> p_query_embedding)::real END,
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
      CASE WHEN q IS NOT NULL AND e.tsv @@ q THEN ts_rank(e.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND e.embedding IS NOT NULL
                AND (e.embedding <=> p_query_embedding) < 0.8
           THEN (e.embedding <=> p_query_embedding)::real END,
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

    -- d. strategic signals
    SELECT
      'signal'::text,
      s.id,
      s.signal_title,
      concat_ws(' ', s.explanation, s.strategic_implications),
      NULL::text,
      s.created_at,
      CASE WHEN q IS NOT NULL AND s.tsv @@ q THEN ts_rank(s.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND s.embedding IS NOT NULL
                AND (s.embedding <=> p_query_embedding) < 0.8
           THEN (s.embedding <=> p_query_embedding)::real END,
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
      AND (
        (q IS NOT NULL AND s.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND s.embedding IS NOT NULL
            AND (s.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- e. posts
    SELECT
      'post'::text,
      lp.id,
      COALESCE(NULLIF(btrim(lp.hook), ''), left(COALESCE(lp.post_text, ''), 80)),
      lp.post_text,
      lp.linkedin_url,
      COALESCE(lp.published_at, lp.created_at),
      CASE WHEN q IS NOT NULL AND lp.tsv @@ q THEN ts_rank(lp.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND lp.embedding IS NOT NULL
                AND (lp.embedding <=> p_query_embedding) < 0.8
           THEN (lp.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'content_type', lp.content_type,
        'framework_type', lp.framework_type,
        'tracking_status', lp.tracking_status,
        'published_at', lp.published_at,
        'engagement_score', lp.engagement_score
      )
    FROM public.linkedin_posts lp
    WHERE lp.user_id = p_user_id
      AND (p_kinds IS NULL OR 'post' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND lp.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND lp.embedding IS NOT NULL
            AND (lp.embedding <=> p_query_embedding) < 0.8)
      )
  ),
  kw_ranked AS (
    SELECT source_kind AS sk, source_id AS sid,
           row_number() OVER (ORDER BY pool.kw_rank DESC) AS pos
    FROM pool
    WHERE pool.kw_rank IS NOT NULL
    ORDER BY pool.kw_rank DESC
    LIMIT cand
  ),
  vec_ranked AS (
    SELECT source_kind AS sk, source_id AS sid,
           row_number() OVER (ORDER BY pool.vec_distance ASC) AS pos
    FROM pool
    WHERE pool.vec_distance IS NOT NULL
    ORDER BY pool.vec_distance ASC
    LIMIT cand
  ),
  fused AS (
    SELECT
      p.*,
      (COALESCE(1.0 / (k + kr.pos), 0) + COALESCE(1.0 / (k + vr.pos), 0))::real AS rrf
    FROM pool p
    LEFT JOIN kw_ranked kr ON kr.sk = p.source_kind AND kr.sid = p.source_id
    LEFT JOIN vec_ranked vr ON vr.sk = p.source_kind AND vr.sid = p.source_id
    WHERE kr.pos IS NOT NULL OR vr.pos IS NOT NULL
  )
  SELECT
    f.source_kind,
    f.source_id,
    f.title,
    f.content,
    f.url,
    f.occurred_at,
    f.rrf AS rank,
    f.kw_rank,
    f.vec_distance,
    f.rrf,
    f.metadata
  FROM fused f
  ORDER BY f.rrf DESC
  LIMIT lim;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_vault(uuid, text, integer, vector, text[], integer) TO service_role, authenticated;
-- ── document_briefs: one grounded brief per document ────────────────────────
CREATE TABLE IF NOT EXISTS public.document_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  thesis text,
  key_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  key_figures jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_pov text,
  contrarian_angles jsonb NOT NULL DEFAULT '[]'::jsonb,
  so_what jsonb NOT NULL DEFAULT '[]'::jsonb,
  coverage jsonb NOT NULL DEFAULT '{}'::jsonb,
  grounding_score real,
  pipeline_version smallint NOT NULL DEFAULT 1,
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  tsv tsvector,
  embedding vector(1536),
  CONSTRAINT document_briefs_doc_version_unique UNIQUE (document_id, pipeline_version)
);

GRANT SELECT ON public.document_briefs TO authenticated;
GRANT ALL ON public.document_briefs TO service_role;

ALTER TABLE public.document_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read their own document briefs" ON public.document_briefs;
CREATE POLICY "Members read their own document briefs"
  ON public.document_briefs FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Service role manages document briefs" ON public.document_briefs;
CREATE POLICY "Service role manages document briefs"
  ON public.document_briefs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Same search plumbing pattern the other searchable tables use.
CREATE OR REPLACE FUNCTION public.document_briefs_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.tsv := to_tsvector('english',
    coalesce(NEW.thesis, '') || ' ' ||
    coalesce(NEW.author_pov, '') || ' ' ||
    coalesce((SELECT string_agg(x->>'claim', ' ') FROM jsonb_array_elements(coalesce(NEW.key_points, '[]'::jsonb)) x), '') || ' ' ||
    coalesce((SELECT string_agg(x->>'claim', ' ') FROM jsonb_array_elements(coalesce(NEW.key_figures, '[]'::jsonb)) x), ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_briefs_tsv_update ON public.document_briefs;
CREATE TRIGGER document_briefs_tsv_update
BEFORE INSERT OR UPDATE ON public.document_briefs
FOR EACH ROW EXECUTE FUNCTION public.document_briefs_tsv_trigger();

CREATE INDEX IF NOT EXISTS idx_document_briefs_tsv ON public.document_briefs USING gin (tsv);
CREATE INDEX IF NOT EXISTS idx_document_briefs_embedding ON public.document_briefs USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_document_briefs_user ON public.document_briefs (user_id);
CREATE INDEX IF NOT EXISTS idx_document_briefs_document ON public.document_briefs (document_id);

-- ── search_vault: add the eighth source kind, 'brief' ───────────────────────
CREATE OR REPLACE FUNCTION public.search_vault(p_user_id uuid, p_query text, p_limit integer DEFAULT 15, p_query_embedding vector DEFAULT NULL::vector, p_kinds text[] DEFAULT NULL::text[], p_candidates integer DEFAULT 60)
 RETURNS TABLE(source_kind text, source_id uuid, title text, content text, url text, occurred_at timestamp with time zone, rank real, kw_rank real, vec_distance real, rrf real, metadata jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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
      'document_chunk'::text AS sk,
      dc.id AS sid,
      d.filename AS ttl,
      dc.content AS body,
      d.file_url AS link,
      dc.created_at AS occ,
      CASE WHEN q IS NOT NULL AND dc.tsv @@ q THEN ts_rank(dc.tsv, q)::real END AS kwr,
      CASE WHEN p_query_embedding IS NOT NULL AND dc.embedding IS NOT NULL
                AND (dc.embedding <=> p_query_embedding) < 0.8
           THEN (dc.embedding <=> p_query_embedding)::real END AS vdist,
      jsonb_build_object(
        'chunk_index', dc.chunk_index,
        'page', dc.metadata -> 'page',
        'document_id', dc.document_id,
        'pipeline_version', dc.pipeline_version
      ) AS meta
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

    UNION ALL

    -- f. learned intelligence (the member's own distilled knowledge)
    SELECT
      'learned_intelligence'::text,
      li.id,
      li.title,
      li.content,
      NULL::text,
      li.created_at,
      CASE WHEN q IS NOT NULL AND li.tsv @@ q THEN ts_rank(li.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL
                AND (li.embedding <=> p_query_embedding) < 0.8
           THEN (li.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'intelligence_type', li.intelligence_type,
        'skill_pillars', to_jsonb(li.skill_pillars),
        'tags', to_jsonb(li.tags),
        'source_entry_id', li.source_entry_id,
        'source_document_id', li.source_document_id
      )
    FROM public.learned_intelligence li
    WHERE li.user_id = p_user_id
      AND (p_kinds IS NULL OR 'learned_intelligence' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND li.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL
            AND (li.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- g. content items
    SELECT
      'content_item'::text,
      ci.id,
      ci.title,
      ci.body,
      NULL::text,
      ci.created_at,
      CASE WHEN q IS NOT NULL AND ci.tsv @@ q THEN ts_rank(ci.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND ci.embedding IS NOT NULL
                AND (ci.embedding <=> p_query_embedding) < 0.8
           THEN (ci.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'type', ci.type,
        'status', ci.status,
        'language', ci.language,
        'made_by', ci.made_by,
        'signal_id', ci.signal_id
      )
    FROM public.content_items ci
    WHERE ci.user_id = p_user_id
      AND (p_kinds IS NULL OR 'content_item' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND ci.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND ci.embedding IS NOT NULL
            AND (ci.embedding <=> p_query_embedding) < 0.8)
      )

    UNION ALL

    -- h. document briefs (grounded whole-document reads)
    SELECT
      'brief'::text,
      db.id,
      (bd.filename || ' — brief'),
      concat_ws(E'\n',
        db.thesis,
        (SELECT string_agg(x->>'claim', E'\n') FROM jsonb_array_elements(coalesce(db.key_points, '[]'::jsonb)) x)
      ),
      bd.file_url,
      db.created_at,
      CASE WHEN q IS NOT NULL AND db.tsv @@ q THEN ts_rank(db.tsv, q)::real END,
      CASE WHEN p_query_embedding IS NOT NULL AND db.embedding IS NOT NULL
                AND (db.embedding <=> p_query_embedding) < 0.8
           THEN (db.embedding <=> p_query_embedding)::real END,
      jsonb_build_object(
        'grounding_score', db.grounding_score,
        'document_id', db.document_id,
        'pipeline_version', db.pipeline_version
      )
    FROM public.document_briefs db
    JOIN public.documents bd ON bd.id = db.document_id
    WHERE db.user_id = p_user_id
      AND (p_kinds IS NULL OR 'brief' = ANY(p_kinds))
      AND (
        (q IS NOT NULL AND db.tsv @@ q)
        OR (p_query_embedding IS NOT NULL AND db.embedding IS NOT NULL
            AND (db.embedding <=> p_query_embedding) < 0.8)
      )
  ),
  kw_ranked AS (
    SELECT pool.sk, pool.sid,
           row_number() OVER (ORDER BY pool.kwr DESC) AS pos
    FROM pool
    WHERE pool.kwr IS NOT NULL
    ORDER BY pool.kwr DESC
    LIMIT cand
  ),
  vec_ranked AS (
    SELECT pool.sk, pool.sid,
           row_number() OVER (ORDER BY pool.vdist ASC) AS pos
    FROM pool
    WHERE pool.vdist IS NOT NULL
    ORDER BY pool.vdist ASC
    LIMIT cand
  ),
  fused AS (
    SELECT
      p.*,
      (COALESCE(1.0 / (k + kr.pos), 0) + COALESCE(1.0 / (k + vr.pos), 0))::real AS rrf
    FROM pool p
    LEFT JOIN kw_ranked kr ON kr.sk = p.sk AND kr.sid = p.sid
    LEFT JOIN vec_ranked vr ON vr.sk = p.sk AND vr.sid = p.sid
    WHERE kr.pos IS NOT NULL OR vr.pos IS NOT NULL
  )
  SELECT
    f.sk,
    f.sid,
    f.ttl,
    f.body,
    f.link,
    f.occ,
    f.rrf,
    f.kwr,
    f.vdist,
    f.rrf,
    f.meta
  FROM fused f
  ORDER BY f.rrf DESC
  LIMIT lim;
END;
$function$;
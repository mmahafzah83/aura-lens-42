-- Learned Intelligence table for deconstructed uploads
CREATE TABLE public.learned_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_entry_id uuid REFERENCES public.entries(id) ON DELETE SET NULL,
  source_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  intelligence_type text NOT NULL DEFAULT 'framework',
  title text NOT NULL,
  content text NOT NULL,
  skill_pillars text[] NOT NULL DEFAULT '{}',
  skill_boost_pct numeric NOT NULL DEFAULT 3,
  tags text[] NOT NULL DEFAULT '{}',
  embedding vector(1536),
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learned_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intelligence" ON public.learned_intelligence FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own intelligence" ON public.learned_intelligence FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own intelligence" ON public.learned_intelligence FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own intelligence" ON public.learned_intelligence FOR DELETE USING (auth.uid() = user_id);

-- Auto-generate tsvector
CREATE OR REPLACE FUNCTION public.learned_intelligence_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER learned_intelligence_tsv_update
  BEFORE INSERT OR UPDATE ON public.learned_intelligence
  FOR EACH ROW EXECUTE FUNCTION public.learned_intelligence_tsv_trigger();

-- Enable realtime for learned_intelligence
ALTER PUBLICATION supabase_realtime ADD TABLE public.learned_intelligence;

-- Update search_vault to also include learned_intelligence
CREATE OR REPLACE FUNCTION public.search_vault(p_user_id uuid, p_query text, p_limit integer DEFAULT 20, p_query_embedding vector DEFAULT NULL::vector)
RETURNS TABLE(source text, id uuid, content text, title text, summary text, skill_pillar text, type text, pinned boolean, created_at timestamptz, rank real)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
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
    WHERE li.user_id = p_user_id
      AND (
        li.tsv @@ websearch_to_tsquery('english', p_query)
        OR (p_query_embedding IS NOT NULL AND li.embedding IS NOT NULL AND (li.embedding <=> p_query_embedding) < 0.8)
      )
  ) combined
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
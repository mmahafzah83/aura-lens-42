
-- Documents table for uploaded PDFs, DOCX, images
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  filename text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  summary text,
  page_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents" ON public.documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own documents" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own documents" ON public.documents FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Users can update own documents" ON public.documents FOR UPDATE USING (auth.uid() = user_id);

-- Document chunks table with full-text search
CREATE TABLE public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  chunk_index int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  tsv tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(content, ''))
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own chunks" ON public.document_chunks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own chunks" ON public.document_chunks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own chunks" ON public.document_chunks FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_document_chunks_tsv ON public.document_chunks USING gin(tsv);

-- Add tsvector to entries for unified search
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(content, '')), 'C')
) STORED;

CREATE INDEX IF NOT EXISTS idx_entries_tsv ON public.entries USING gin(tsv);

-- Full-text search function across vault
CREATE OR REPLACE FUNCTION public.search_vault(
  p_user_id uuid,
  p_query text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
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
SET search_path = public
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
      ts_rank(e.tsv, websearch_to_tsquery('english', p_query)) AS rank
    FROM public.entries e
    WHERE e.user_id = p_user_id
      AND e.tsv @@ websearch_to_tsquery('english', p_query)

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
      ts_rank(dc.tsv, websearch_to_tsquery('english', p_query)) AS rank
    FROM public.document_chunks dc
    JOIN public.documents d ON dc.document_id = d.id
    WHERE dc.user_id = p_user_id
      AND dc.tsv @@ websearch_to_tsquery('english', p_query)
  ) combined
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false) ON CONFLICT DO NOTHING;

-- Storage RLS for documents bucket
CREATE POLICY "Users can upload documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own documents" ON storage.objects FOR SELECT USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete own documents" ON storage.objects FOR DELETE USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

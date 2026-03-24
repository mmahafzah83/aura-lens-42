
-- Source Registry: unified index of all user knowledge inputs
CREATE TABLE public.source_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_type text NOT NULL, -- 'entry', 'document', 'document_chunk', 'framework', 'intelligence', 'post', 'voice_transcript', 'image', 'link_summary'
  source_id uuid NOT NULL,
  title text,
  content_preview text,
  source_metadata jsonb DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  fragment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, source_type, source_id)
);

ALTER TABLE public.source_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sources" ON public.source_registry FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sources" ON public.source_registry FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sources" ON public.source_registry FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own sources" ON public.source_registry FOR DELETE USING (auth.uid() = user_id);

-- Evidence Fragments: structured extractions from every source
CREATE TABLE public.evidence_fragments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_registry_id uuid NOT NULL REFERENCES public.source_registry(id) ON DELETE CASCADE,
  fragment_type text NOT NULL, -- 'claim', 'signal', 'framework_step', 'market_fact', 'skill_evidence', 'insight', 'pattern', 'recommendation'
  title text NOT NULL,
  content text NOT NULL,
  confidence numeric NOT NULL DEFAULT 0.7,
  skill_pillars text[] NOT NULL DEFAULT '{}'::text[],
  tags text[] NOT NULL DEFAULT '{}'::text[],
  entities jsonb DEFAULT '[]'::jsonb, -- extracted entities (companies, people, metrics)
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536),
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.evidence_fragments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fragments" ON public.evidence_fragments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own fragments" ON public.evidence_fragments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own fragments" ON public.evidence_fragments FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own fragments" ON public.evidence_fragments FOR DELETE USING (auth.uid() = user_id);

-- TSV trigger for evidence fragments
CREATE OR REPLACE FUNCTION public.evidence_fragments_tsv_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.tsv := to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.content, ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER evidence_fragments_tsv_update
  BEFORE INSERT OR UPDATE ON public.evidence_fragments
  FOR EACH ROW EXECUTE FUNCTION public.evidence_fragments_tsv_trigger();

-- Index for fast lookups
CREATE INDEX idx_source_registry_user_processed ON public.source_registry(user_id, processed);
CREATE INDEX idx_source_registry_source ON public.source_registry(source_type, source_id);
CREATE INDEX idx_evidence_fragments_user ON public.evidence_fragments(user_id);
CREATE INDEX idx_evidence_fragments_type ON public.evidence_fragments(fragment_type);
CREATE INDEX idx_evidence_fragments_source ON public.evidence_fragments(source_registry_id);
CREATE INDEX idx_evidence_fragments_tsv ON public.evidence_fragments USING gin(tsv);

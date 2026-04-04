
CREATE TABLE public.captures (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  raw_content TEXT,
  extracted_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own captures" ON public.captures FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own captures" ON public.captures FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own captures" ON public.captures FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own captures" ON public.captures FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_captures_user_id ON public.captures(user_id);
CREATE INDEX idx_captures_source_url ON public.captures(source_url);


CREATE TABLE public.content_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signal_id UUID REFERENCES public.strategic_signals(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('linkedin_post', 'carousel', 'framework', 'article', 'whitepaper')),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  generation_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'discarded')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content items" ON public.content_items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own content items" ON public.content_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own content items" ON public.content_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own content items" ON public.content_items FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_content_items_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

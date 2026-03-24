CREATE TABLE public.strategic_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  signal_title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  strategic_implications TEXT NOT NULL,
  supporting_evidence_ids UUID[] NOT NULL DEFAULT '{}',
  theme_tags TEXT[] NOT NULL DEFAULT '{}',
  skill_pillars TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC NOT NULL DEFAULT 0.7,
  fragment_count INTEGER NOT NULL DEFAULT 0,
  framework_opportunity JSONB DEFAULT '{}'::jsonb,
  content_opportunity JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.strategic_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own signals" ON public.strategic_signals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own signals" ON public.strategic_signals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own signals" ON public.strategic_signals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own signals" ON public.strategic_signals FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_strategic_signals_updated_at BEFORE UPDATE ON public.strategic_signals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
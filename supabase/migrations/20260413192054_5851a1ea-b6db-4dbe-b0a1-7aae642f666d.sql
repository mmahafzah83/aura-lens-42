
CREATE TABLE public.recommended_moves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  output_type TEXT NOT NULL DEFAULT 'post',
  source_signal_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '24 hours'),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recommended_moves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own moves" ON public.recommended_moves FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own moves" ON public.recommended_moves FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own moves" ON public.recommended_moves FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own moves" ON public.recommended_moves FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_recommended_moves_updated_at
  BEFORE UPDATE ON public.recommended_moves
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.desk_learning (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('asks_about','acts_on','rejects','talks_like','corrects')),
  observation TEXT NOT NULL,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence TEXT NOT NULL DEFAULT 'observed' CHECK (confidence IN ('observed','strong')),
  dismissed BOOLEAN NOT NULL DEFAULT false,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT desk_learning_unique UNIQUE (user_id, kind, observation)
);

CREATE INDEX idx_desk_learning_user ON public.desk_learning (user_id, dismissed, evidence_count DESC);

GRANT SELECT, UPDATE ON public.desk_learning TO authenticated;
GRANT ALL ON public.desk_learning TO service_role;

ALTER TABLE public.desk_learning ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own learning"
  ON public.desk_learning FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members dismiss their own learning"
  ON public.desk_learning FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role writes learning"
  ON public.desk_learning FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TABLE public.desk_answer_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  question TEXT NOT NULL DEFAULT '',
  answer TEXT NOT NULL DEFAULT '',
  verdict TEXT NOT NULL CHECK (verdict IN ('yes','no')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_desk_answer_feedback_user ON public.desk_answer_feedback (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.desk_answer_feedback TO authenticated;
GRANT ALL ON public.desk_answer_feedback TO service_role;

ALTER TABLE public.desk_answer_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own answer feedback"
  ON public.desk_answer_feedback FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Members write their own answer feedback"
  ON public.desk_answer_feedback FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages answer feedback"
  ON public.desk_answer_feedback FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER desk_learning_updated_at
  BEFORE UPDATE ON public.desk_learning
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
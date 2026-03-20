
CREATE TABLE public.skill_targets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pillar text NOT NULL,
  target_hours numeric(7,2) NOT NULL DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, pillar)
);

ALTER TABLE public.skill_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own targets" ON public.skill_targets FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own targets" ON public.skill_targets FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own targets" ON public.skill_targets FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own targets" ON public.skill_targets FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_skill_targets_updated_at BEFORE UPDATE ON public.skill_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

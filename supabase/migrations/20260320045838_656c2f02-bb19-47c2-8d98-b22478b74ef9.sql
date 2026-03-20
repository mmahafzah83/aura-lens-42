
-- Add skill_pillar and title columns to entries
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS skill_pillar text;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS title text;

-- Create training_logs table
CREATE TABLE public.training_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pillar text NOT NULL,
  duration_hours numeric(5,2) NOT NULL DEFAULT 0,
  topic text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.training_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own training logs" ON public.training_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own training logs" ON public.training_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own training logs" ON public.training_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own training logs" ON public.training_logs FOR DELETE USING (auth.uid() = user_id);

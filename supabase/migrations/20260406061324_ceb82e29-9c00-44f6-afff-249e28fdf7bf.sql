
-- Create industry_trends table
CREATE TABLE public.industry_trends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  headline TEXT NOT NULL,
  insight TEXT NOT NULL,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new'
);

-- Enable RLS
ALTER TABLE public.industry_trends ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own trends" ON public.industry_trends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trends" ON public.industry_trends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trends" ON public.industry_trends FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own trends" ON public.industry_trends FOR DELETE USING (auth.uid() = user_id);

-- Add last_visit_at to diagnostic_profiles
ALTER TABLE public.diagnostic_profiles ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE public.diagnostic_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  firm text,
  level text,
  core_practice text,
  sector_focus text,
  north_star_goal text,
  years_experience text,
  leadership_style text,
  generated_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  skill_ratings jsonb NOT NULL DEFAULT '{}'::jsonb,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.diagnostic_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.diagnostic_profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.diagnostic_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.diagnostic_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own profile" ON public.diagnostic_profiles FOR DELETE USING (auth.uid() = user_id);
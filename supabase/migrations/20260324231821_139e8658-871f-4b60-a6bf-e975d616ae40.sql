
CREATE TABLE public.authority_voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tone text NOT NULL DEFAULT '',
  preferred_structures jsonb NOT NULL DEFAULT '[]'::jsonb,
  storytelling_patterns jsonb NOT NULL DEFAULT '[]'::jsonb,
  example_posts jsonb NOT NULL DEFAULT '[]'::jsonb,
  admired_posts jsonb NOT NULL DEFAULT '[]'::jsonb,
  vocabulary_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.authority_voice_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own voice profile" ON public.authority_voice_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own voice profile" ON public.authority_voice_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own voice profile" ON public.authority_voice_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own voice profile" ON public.authority_voice_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.narrative_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  topic text NOT NULL,
  angle text NOT NULL DEFAULT '',
  recommended_format text NOT NULL DEFAULT 'post',
  reason text NOT NULL DEFAULT '',
  source_signal_id uuid,
  status text NOT NULL DEFAULT 'suggested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.narrative_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own suggestions" ON public.narrative_suggestions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own suggestions" ON public.narrative_suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own suggestions" ON public.narrative_suggestions FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own suggestions" ON public.narrative_suggestions FOR DELETE TO authenticated USING (auth.uid() = user_id);

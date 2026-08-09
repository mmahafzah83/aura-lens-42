CREATE TABLE public.voice_post_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.linkedin_posts(id) ON DELETE CASCADE,
  published_at timestamptz,
  followers_at_publish integer,
  impressions integer,
  engagement_rate numeric,
  reactions integer,
  comments integer,
  shares integer,
  performance_index numeric,
  performance_index_raw numeric,
  baseline_engagement_rate numeric,
  sample_traits jsonb NOT NULL DEFAULT '{}'::jsonb,
  hook_style text,
  ending_type text,
  computed_at timestamptz NOT NULL DEFAULT now(),
  excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id)
);

CREATE INDEX voice_post_outcomes_user_idx ON public.voice_post_outcomes (user_id, published_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_post_outcomes TO authenticated;
GRANT ALL ON public.voice_post_outcomes TO service_role;

ALTER TABLE public.voice_post_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own outcomes" ON public.voice_post_outcomes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts own outcomes" ON public.voice_post_outcomes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates own outcomes" ON public.voice_post_outcomes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner deletes own outcomes" ON public.voice_post_outcomes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_voice_post_outcomes_updated_at
  BEFORE UPDATE ON public.voice_post_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.voice_learning_prefs (
  user_id uuid PRIMARY KEY,
  learn_from_performance boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.voice_learning_prefs TO authenticated;
GRANT ALL ON public.voice_learning_prefs TO service_role;

ALTER TABLE public.voice_learning_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own learning pref" ON public.voice_learning_prefs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts own learning pref" ON public.voice_learning_prefs
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates own learning pref" ON public.voice_learning_prefs
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_voice_learning_prefs_updated_at
  BEFORE UPDATE ON public.voice_learning_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
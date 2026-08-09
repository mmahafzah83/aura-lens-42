-- 1. Trait registry (dictionary)
CREATE TABLE public.voice_trait_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trait_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  pole_low text NOT NULL,
  pole_high text NOT NULL,
  group_key text NOT NULL CHECK (group_key IN ('sound','structure','language')),
  unit text,
  computable boolean NOT NULL DEFAULT true,
  min_evidence int NOT NULL DEFAULT 8,
  sort_order int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voice_trait_registry TO authenticated;
GRANT ALL ON public.voice_trait_registry TO service_role;

ALTER TABLE public.voice_trait_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Registry readable by authenticated"
  ON public.voice_trait_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Registry writable by admin"
  ON public.voice_trait_registry FOR ALL TO authenticated
  USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

INSERT INTO public.voice_trait_registry
  (trait_key, display_name, pole_low, pole_high, group_key, unit, computable, min_evidence, sort_order)
VALUES
  ('directness','Directness','Diplomatic','Direct','sound',NULL,false,8,10),
  ('warmth','Warmth','Cool / analytical','Warm / personal','sound',NULL,false,8,20),
  ('challenge','Challenge','Reassuring','Challenging','sound',NULL,false,8,30),
  ('evidence_density','Evidence density','Narrative','Data-led','sound','ratio',true,8,40),
  ('pace','Pace','Flowing','Clipped','structure','ratio',true,8,50),
  ('formality','Formality','Conversational','Formal','sound',NULL,false,8,60),
  ('length','Length','800 chars','2,600 chars','structure','chars',true,8,70),
  ('emoji','Emoji','None','Frequent','structure','ratio',true,8,80),
  ('language_mix','Language mix','All English','All Arabic','language','percent',true,8,90);

-- 2. Measured traits
CREATE TABLE public.voice_traits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.authority_voice_profiles(id) ON DELETE CASCADE,
  trait_key text NOT NULL REFERENCES public.voice_trait_registry(trait_key),
  value numeric NOT NULL CHECK (value >= 0 AND value <= 100),
  band_low numeric,
  band_high numeric,
  raw_value numeric,
  confidence text NOT NULL CHECK (confidence IN ('low','medium','high')),
  source text NOT NULL CHECK (source IN ('learned','user','aura')),
  evidence_count int NOT NULL DEFAULT 0,
  locked boolean NOT NULL DEFAULT false,
  last_confirmed_at timestamptz,
  computed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, trait_key)
);
CREATE INDEX voice_traits_user_id_idx ON public.voice_traits(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_traits TO authenticated;
GRANT ALL ON public.voice_traits TO service_role;

ALTER TABLE public.voice_traits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own traits" ON public.voice_traits
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts own traits" ON public.voice_traits
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates own traits" ON public.voice_traits
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner deletes own traits" ON public.voice_traits
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TRIGGER update_voice_traits_updated_at
  BEFORE UPDATE ON public.voice_traits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Feedback loop memory
CREATE TABLE public.voice_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid,
  post_id uuid REFERENCES public.linkedin_posts(id) ON DELETE SET NULL,
  sample_text text,
  verdict text NOT NULL CHECK (verdict IN ('sounds_like_me','partly','not_me','too_formal','too_generic','too_aggressive','would_never_say')),
  applied_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  mode_scope text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_feedback_user_id_idx ON public.voice_feedback(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_feedback TO authenticated;
GRANT ALL ON public.voice_feedback TO service_role;

ALTER TABLE public.voice_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own feedback" ON public.voice_feedback
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Owner inserts own feedback" ON public.voice_feedback
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner updates own feedback" ON public.voice_feedback
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Owner deletes own feedback" ON public.voice_feedback
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 4. Modes on the existing profile table
ALTER TABLE public.authority_voice_profiles
  ADD COLUMN IF NOT EXISTS mode_key text,
  ADD COLUMN IF NOT EXISTS mode_label text,
  ADD COLUMN IF NOT EXISTS readiness text;

ALTER TABLE public.authority_voice_profiles
  ADD CONSTRAINT authority_voice_profiles_mode_key_check
  CHECK (mode_key IS NULL OR mode_key IN ('executive','thought_leadership','educational','personal','contrarian','default'));

ALTER TABLE public.authority_voice_profiles
  ADD CONSTRAINT authority_voice_profiles_readiness_check
  CHECK (readiness IS NULL OR readiness IN ('forming','developing','working','reliable','distinctive'));

UPDATE public.authority_voice_profiles
  SET mode_key = COALESCE(mode_key, 'default'),
      mode_label = COALESCE(mode_label, 'Thought Leadership');

-- 8. Readiness computed from real data
CREATE OR REPLACE FUNCTION public.voice_profile_readiness(p_profile_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_posts int;
  v_low int;
  v_computable int;
  v_openers int;
  v_opener_rows int;
  v_diversity numeric;
BEGIN
  SELECT user_id INTO v_user FROM public.authority_voice_profiles WHERE id = p_profile_id;
  IF v_user IS NULL THEN RETURN NULL; END IF;

  SELECT count(*) INTO v_posts
  FROM public.linkedin_posts
  WHERE user_id = v_user
    AND post_text IS NOT NULL
    AND length(post_text) > 50
    AND COALESCE(authorship, 'unknown') <> 'aura_drafted';

  SELECT count(*) INTO v_low
  FROM public.voice_traits t
  JOIN public.voice_trait_registry r ON r.trait_key = t.trait_key
  WHERE t.profile_id = p_profile_id AND r.computable AND t.confidence = 'low';

  SELECT count(*) INTO v_computable FROM public.voice_trait_registry WHERE computable AND active;

  IF v_posts < 8 THEN RETURN 'forming'; END IF;
  IF v_posts < 20 THEN RETURN 'developing'; END IF;
  IF v_posts < 30 OR v_low > 0 OR v_computable = 0 THEN RETURN 'working'; END IF;

  SELECT count(DISTINCT hook_style), count(*) INTO v_openers, v_opener_rows
  FROM public.linkedin_posts
  WHERE user_id = v_user AND hook_style IS NOT NULL;

  v_diversity := CASE WHEN v_opener_rows = 0 THEN 0 ELSE (v_openers::numeric / 7) * 100 END;
  IF v_diversity >= 60 THEN RETURN 'distinctive'; END IF;
  RETURN 'reliable';
END;
$$;

REVOKE ALL ON FUNCTION public.voice_profile_readiness(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.voice_profile_readiness(uuid) TO authenticated, service_role;
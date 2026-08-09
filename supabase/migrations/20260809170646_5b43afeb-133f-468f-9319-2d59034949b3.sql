CREATE TABLE public.voice_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  profile_id uuid REFERENCES public.authority_voice_profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('always','never','anchor')),
  text text NOT NULL,
  source text NOT NULL DEFAULT 'user' CHECK (source IN ('learned','user','aura')),
  rank int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_rules_user_kind_idx ON public.voice_rules (user_id, kind, rank);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_rules TO authenticated;
GRANT ALL ON public.voice_rules TO service_role;
ALTER TABLE public.voice_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_rules_owner_all" ON public.voice_rules FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER voice_rules_updated_at BEFORE UPDATE ON public.voice_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.voice_trait_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.authority_voice_profiles(id) ON DELETE CASCADE,
  trait_key text NOT NULL,
  rejected_value numeric,
  rejected_until timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_trait_rejections_lookup_idx ON public.voice_trait_rejections (profile_id, trait_key, rejected_until);
GRANT SELECT, INSERT, DELETE ON public.voice_trait_rejections TO authenticated;
GRANT ALL ON public.voice_trait_rejections TO service_role;
ALTER TABLE public.voice_trait_rejections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_trait_rejections_owner_all" ON public.voice_trait_rejections FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
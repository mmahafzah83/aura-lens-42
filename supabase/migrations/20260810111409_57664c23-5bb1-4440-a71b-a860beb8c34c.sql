CREATE TABLE public.profile_copy_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target text NOT NULL CHECK (target IN ('headline','about')),
  options jsonb NOT NULL,
  language text,
  posts_used int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, target)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_copy_drafts TO authenticated;
GRANT ALL ON public.profile_copy_drafts TO service_role;

ALTER TABLE public.profile_copy_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own profile copy drafts"
  ON public.profile_copy_drafts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Members create their own profile copy drafts"
  ON public.profile_copy_drafts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members update their own profile copy drafts"
  ON public.profile_copy_drafts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Members delete their own profile copy drafts"
  ON public.profile_copy_drafts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_profile_copy_drafts_updated_at
  BEFORE UPDATE ON public.profile_copy_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
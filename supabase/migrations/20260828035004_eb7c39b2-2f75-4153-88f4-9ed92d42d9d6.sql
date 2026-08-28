CREATE TABLE public.decks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  signal_id uuid,
  lang text,
  template text,
  theme text,
  slides jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.decks TO authenticated;
GRANT ALL ON public.decks TO service_role;

ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "decks_select_own" ON public.decks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "decks_insert_own" ON public.decks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decks_update_own" ON public.decks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "decks_delete_own" ON public.decks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX decks_user_id_created_at_idx ON public.decks (user_id, created_at DESC);

CREATE TRIGGER decks_set_updated_at
  BEFORE UPDATE ON public.decks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.user_widget_layout (
  user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_widget_layout TO authenticated;
GRANT ALL ON public.user_widget_layout TO service_role;

ALTER TABLE public.user_widget_layout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own layout select" ON public.user_widget_layout
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own layout insert" ON public.user_widget_layout
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own layout update" ON public.user_widget_layout
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.widget_slot_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slot_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, slot_key)
);

GRANT SELECT, INSERT, DELETE ON public.widget_slot_votes TO authenticated;
GRANT ALL ON public.widget_slot_votes TO service_role;

ALTER TABLE public.widget_slot_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own vote select" ON public.widget_slot_votes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own vote insert" ON public.widget_slot_votes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own vote delete" ON public.widget_slot_votes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Aggregate-only tally, mirroring the founding_seats() pattern: SECURITY
-- DEFINER with search_path pinned, integers out, no user identities.
CREATE OR REPLACE FUNCTION public.widget_slot_tally()
RETURNS TABLE(slot_key text, vote_count integer, eligible_members integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.slot_key,
         count(*)::integer AS vote_count,
         (SELECT count(*)::integer FROM public.beta_allowlist
           WHERE status IN ('invited','active')) AS eligible_members
  FROM public.widget_slot_votes v
  GROUP BY v.slot_key;
$$;

REVOKE ALL ON FUNCTION public.widget_slot_tally() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.widget_slot_tally() TO authenticated;
CREATE TABLE public.voice_distribution (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  language text NOT NULL,
  corpus_n integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  open_type_share jsonb,
  land_type_share jsonb,
  move_share jsonb,
  marker_rate jsonb,
  length_p25 integer,
  length_p50 integer,
  length_p75 integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language)
);

GRANT SELECT ON public.voice_distribution TO authenticated;
GRANT ALL ON public.voice_distribution TO service_role;

ALTER TABLE public.voice_distribution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own voice distribution"
ON public.voice_distribution FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER update_voice_distribution_updated_at
BEFORE UPDATE ON public.voice_distribution
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS voice_match numeric,
  ADD COLUMN IF NOT EXISTS voice_fidelity_flags text[];
CREATE TABLE public.register_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text UNIQUE NOT NULL,
  language text,
  sort_order int,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.register_options TO authenticated;
GRANT ALL ON public.register_options TO service_role;

ALTER TABLE public.register_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read register options"
ON public.register_options FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role can write register options"
ON public.register_options FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.register_options (label, language, sort_order) VALUES
  ('contemporary Gulf professional Arabic', 'ar', 1),
  ('contemporary Egyptian professional Arabic', 'ar', 2),
  ('contemporary Levantine professional Arabic', 'ar', 3),
  ('Modern Standard Arabic', 'ar', 4),
  ('professional English', 'en', 5);

ALTER TABLE public.diagnostic_profiles ADD COLUMN IF NOT EXISTS target_register text;

UPDATE public.diagnostic_profiles SET target_register = 'contemporary Gulf professional Arabic';
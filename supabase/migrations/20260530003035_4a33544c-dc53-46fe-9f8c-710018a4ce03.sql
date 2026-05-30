CREATE TABLE public.guide_slug_misses (
  slug text NOT NULL,
  surface text NOT NULL,
  count int NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, surface)
);

GRANT SELECT, INSERT, UPDATE ON public.guide_slug_misses TO authenticated;
GRANT ALL ON public.guide_slug_misses TO service_role;

ALTER TABLE public.guide_slug_misses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can insert misses"
ON public.guide_slug_misses
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update misses"
ON public.guide_slug_misses
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Admin only select misses"
ON public.guide_slug_misses
FOR SELECT
TO authenticated
USING (auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid);
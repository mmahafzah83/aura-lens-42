CREATE TABLE IF NOT EXISTS public.linkedin_profile_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  full_name text,
  headline text,
  about text,
  photo_url text,
  location text,
  followers integer,
  connections integer,
  experience jsonb,
  education jsonb,
  skills jsonb,
  languages jsonb,
  certifications jsonb,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

GRANT SELECT ON public.linkedin_profile_snapshots TO authenticated;
GRANT ALL ON public.linkedin_profile_snapshots TO service_role;

ALTER TABLE public.linkedin_profile_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their own LinkedIn snapshot"
  ON public.linkedin_profile_snapshots
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR auth.uid() = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
  );

CREATE TRIGGER update_linkedin_profile_snapshots_updated_at
  BEFORE UPDATE ON public.linkedin_profile_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
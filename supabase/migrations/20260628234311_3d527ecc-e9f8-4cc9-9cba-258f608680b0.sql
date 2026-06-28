
ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.diagnostic_profiles
  SET is_admin = true
  WHERE user_id = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3';

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.diagnostic_profiles
    WHERE user_id = auth.uid() AND is_admin = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

ALTER TABLE public.diagnostic_profiles
  ADD COLUMN IF NOT EXISTS display_name_override text;

COMMENT ON COLUMN public.diagnostic_profiles.display_name_override IS
  'Member-set name that wins over linkedin_connections.display_name and first/last name. Set inline from the carousel studio.';

CREATE OR REPLACE FUNCTION public.enforce_published_authorship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.published_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.authorship IS NULL
     OR NEW.authorship NOT IN ('aura_drafted','aura_assisted','user_written','unknown') THEN
    IF NEW.source_type = 'aura_generated' THEN
      NEW.authorship := 'aura_drafted';
    ELSIF NEW.source_type IN ('linkedin_export','csv_import','linkedin_own') THEN
      NEW.authorship := 'user_written';
    ELSE
      NEW.authorship := 'unknown';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
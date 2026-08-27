CREATE OR REPLACE FUNCTION public.guard_account_type_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.account_type IS DISTINCT FROM OLD.account_type
      OR NEW.excluded_reason IS DISTINCT FROM OLD.excluded_reason
      OR NEW.excluded_at IS DISTINCT FROM OLD.excluded_at)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change account_type, excluded_reason or excluded_at';
  END IF;

  IF (NEW.plan IS DISTINCT FROM OLD.plan
      OR NEW.tier IS DISTINCT FROM OLD.tier
      OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
      OR NEW.plan_started_at IS DISTINCT FROM OLD.plan_started_at)
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can change plan, tier, trial_ends_at or plan_started_at';
  END IF;

  RETURN NEW;
END;
$function$;
-- F1: make the error log an error log.
-- 1) Canonicalise existing severities.
UPDATE public.ef_error_log SET severity = CASE
  WHEN error_message ~* '^(OE_FETCH_OK|MORNING_SIGNAL run|served cached address|OE_JUDGE_OK|EF_BOOT_CHECK|DRAFT_READY_EMAIL|cron run complete)' THEN 'info'
  WHEN lower(coalesce(severity,'')) IN ('info','ok','debug','notice') THEN 'info'
  WHEN lower(coalesce(severity,'')) IN ('critical','fatal') THEN 'fatal'
  WHEN lower(coalesce(severity,'')) IN ('warn','warning','medium','med','low') THEN 'warn'
  ELSE 'error' END;

-- 2) A normaliser so no call site can ever break logging with a legacy word.
CREATE OR REPLACE FUNCTION public.ef_error_log_normalise()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.severity := CASE lower(coalesce(NEW.severity,'error'))
    WHEN 'debug' THEN 'debug'
    WHEN 'info' THEN 'info' WHEN 'ok' THEN 'info' WHEN 'notice' THEN 'info'
    WHEN 'warn' THEN 'warn' WHEN 'warning' THEN 'warn' WHEN 'low' THEN 'warn'
    WHEN 'medium' THEN 'warn' WHEN 'med' THEN 'warn'
    WHEN 'error' THEN 'error' WHEN 'high' THEN 'error'
    WHEN 'fatal' THEN 'fatal' WHEN 'critical' THEN 'fatal'
    ELSE 'error' END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ef_error_log_normalise_trg ON public.ef_error_log;
CREATE TRIGGER ef_error_log_normalise_trg
BEFORE INSERT OR UPDATE ON public.ef_error_log
FOR EACH ROW EXECUTE FUNCTION public.ef_error_log_normalise();

-- 3) Closed vocabulary and default.
ALTER TABLE public.ef_error_log ALTER COLUMN severity SET DEFAULT 'error';
ALTER TABLE public.ef_error_log DROP CONSTRAINT IF EXISTS ef_error_log_severity_check;
ALTER TABLE public.ef_error_log ADD CONSTRAINT ef_error_log_severity_check
  CHECK (severity IN ('debug','info','warn','error','fatal'));

-- 4) The one thing anyone should look at.
CREATE OR REPLACE VIEW public.ef_failures WITH (security_invoker = on) AS
SELECT id, created_at, function_name, severity, error_message, user_id, context
FROM public.ef_error_log
WHERE severity IN ('error','fatal') AND created_at > now() - interval '7 days';

GRANT SELECT ON public.ef_failures TO authenticated;
GRANT ALL ON public.ef_failures TO service_role;
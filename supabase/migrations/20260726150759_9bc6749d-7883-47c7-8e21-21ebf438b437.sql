-- 1. Append-only shape ------------------------------------------------------
ALTER TABLE public.daily_brief_snapshots
  DROP CONSTRAINT IF EXISTS daily_brief_snapshots_brief_date_key;
DROP INDEX IF EXISTS daily_brief_snapshots_brief_date_key;

ALTER TABLE public.daily_brief_snapshots
  ADD COLUMN IF NOT EXISTS run_seq int,
  ADD COLUMN IF NOT EXISTS is_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rendered_html text,
  ADD COLUMN IF NOT EXISTS run_reason text;

-- Label pre-existing rows as run 1. This is not invented history: the rows
-- already exist, they simply had no run number.
UPDATE public.daily_brief_snapshots SET run_seq = 1 WHERE run_seq IS NULL;
ALTER TABLE public.daily_brief_snapshots ALTER COLUMN run_seq SET NOT NULL;

ALTER TABLE public.daily_brief_snapshots
  DROP CONSTRAINT IF EXISTS daily_brief_snapshots_date_run_key;
ALTER TABLE public.daily_brief_snapshots
  ADD CONSTRAINT daily_brief_snapshots_date_run_key UNIQUE (brief_date, run_seq);

-- 2. Immutability enforced by the database, not by convention ---------------
CREATE OR REPLACE FUNCTION public.daily_brief_snapshots_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'daily_brief_snapshots is append-only: % is forbidden. Record a correction as a new run.',
    TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS daily_brief_snapshots_no_mutation ON public.daily_brief_snapshots;
CREATE TRIGGER daily_brief_snapshots_no_mutation
  BEFORE UPDATE OR DELETE ON public.daily_brief_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.daily_brief_snapshots_immutable();

-- 3. Latest run per day -----------------------------------------------------
CREATE OR REPLACE VIEW public.daily_brief_latest AS
SELECT DISTINCT ON (s.brief_date) s.*
FROM public.daily_brief_snapshots s
ORDER BY s.brief_date DESC, s.run_seq DESC;

GRANT SELECT ON public.daily_brief_latest TO authenticated;
GRANT ALL ON public.daily_brief_latest TO service_role;

-- 4. Atomic run recorder ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_brief_run(
  p_brief_date date,
  p_payload jsonb,
  p_audit jsonb,
  p_is_sent boolean,
  p_run_reason text,
  p_rendered_html text
)
RETURNS TABLE(id uuid, run_seq int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_seq int;
BEGIN
  SELECT coalesce(max(s.run_seq), 0) + 1 INTO v_seq
  FROM public.daily_brief_snapshots s WHERE s.brief_date = p_brief_date;

  RETURN QUERY
  INSERT INTO public.daily_brief_snapshots
    (brief_date, payload, audit, run_seq, is_sent, run_reason, rendered_html)
  VALUES
    (p_brief_date, coalesce(p_payload,'{}'::jsonb), coalesce(p_audit,'{}'::jsonb),
     v_seq, coalesce(p_is_sent,false), p_run_reason, p_rendered_html)
  RETURNING daily_brief_snapshots.id, daily_brief_snapshots.run_seq;
END;
$$;

-- 5. History ----------------------------------------------------------------
-- Deliberately reports the FIRST run of each day (run_seq = 1). The first run
-- is the honest one: it is what was actually true that morning, before anyone
-- pressed refresh. Using the latest run would let today's refresh silently
-- rewrite last week's trend line.
CREATE OR REPLACE FUNCTION public.brief_history(days int DEFAULT 30)
RETURNS TABLE(
  brief_date date,
  runs int,
  sent boolean,
  funnel jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.brief_date,
    count(*)::int AS runs,
    bool_or(s.is_sent) AS sent,
    (SELECT f.payload->'funnel'
       FROM public.daily_brief_snapshots f
      WHERE f.brief_date = s.brief_date
      ORDER BY f.run_seq ASC
      LIMIT 1) AS funnel
  FROM public.daily_brief_snapshots s
  WHERE s.brief_date > (now()::date - greatest(coalesce(days, 30), 1))
  GROUP BY s.brief_date
  ORDER BY s.brief_date DESC;
$$;
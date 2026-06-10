
-- =========================================================
-- ENGINE SPINE: four tables + RLS (read-only for users)
-- =========================================================

-- ---------- TABLE 1: source_events ----------
CREATE TABLE public.source_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_events_unique_intake UNIQUE (user_id, source_table, source_id, event_type)
);

CREATE INDEX source_events_user_occurred_idx
  ON public.source_events (user_id, occurred_at DESC);
CREATE INDEX source_events_user_unprocessed_idx
  ON public.source_events (user_id, processed_at)
  WHERE processed_at IS NULL;

COMMENT ON TABLE public.source_events IS 'Writer: ingest-source-event only';

GRANT SELECT ON public.source_events TO authenticated;
GRANT ALL ON public.source_events TO service_role;

ALTER TABLE public.source_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "source_events_select_own"
  ON public.source_events
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------- TABLE 2: facet_states ----------
CREATE TABLE public.facet_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  facet text NOT NULL CHECK (facet IN
    ('identity','edge','voice','focus','audience','discernment','conviction')),
  value numeric NOT NULL DEFAULT 0 CHECK (value >= 0 AND value <= 1),
  uncertainty numeric NOT NULL DEFAULT 1 CHECK (uncertainty >= 0 AND uncertainty <= 1),
  last_reinforced_at timestamptz,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT facet_states_unique_user_facet UNIQUE (user_id, facet)
);

COMMENT ON TABLE public.facet_states IS 'Writer: integrate-facets only';

GRANT SELECT ON public.facet_states TO authenticated;
GRANT ALL ON public.facet_states TO service_role;

ALTER TABLE public.facet_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "facet_states_select_own"
  ON public.facet_states
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- updated_at trigger (reuse shared helper if it exists; create a local fallback)
CREATE OR REPLACE FUNCTION public.set_updated_at_facet_states()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER facet_states_set_updated_at
  BEFORE UPDATE ON public.facet_states
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_facet_states();

-- ---------- TABLE 3: imprint_snapshots ----------
CREATE TABLE public.imprint_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  imprint numeric NOT NULL,
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  facet_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  formula_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX imprint_snapshots_user_created_idx
  ON public.imprint_snapshots (user_id, created_at DESC);

COMMENT ON TABLE public.imprint_snapshots IS 'Writer: compute-imprint only';

GRANT SELECT ON public.imprint_snapshots TO authenticated;
GRANT ALL ON public.imprint_snapshots TO service_role;

ALTER TABLE public.imprint_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imprint_snapshots_select_own"
  ON public.imprint_snapshots
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ---------- TABLE 4: eval_metrics ----------
CREATE TABLE public.eval_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  metric text NOT NULL,
  value numeric NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  measured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eval_metrics_metric_measured_idx
  ON public.eval_metrics (metric, measured_at DESC);
CREATE INDEX eval_metrics_user_measured_idx
  ON public.eval_metrics (user_id, measured_at DESC);

COMMENT ON TABLE public.eval_metrics IS 'Writer: compute-imprint + eval jobs only';

GRANT SELECT ON public.eval_metrics TO authenticated;
GRANT ALL ON public.eval_metrics TO service_role;

ALTER TABLE public.eval_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "eval_metrics_select_own_or_system"
  ON public.eval_metrics
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL);

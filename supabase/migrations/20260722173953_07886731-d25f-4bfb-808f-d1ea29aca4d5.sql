
CREATE OR REPLACE FUNCTION public.reconcile_signal_counts()
RETURNS TABLE(signals_checked int, signals_fixed int, dead_ids_pruned int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_checked int := 0;
  v_fixed   int := 0;
  v_pruned  int := 0;
  r record;
  v_pruned_ids uuid[];
  v_dead int;
  v_new_frag_count int;
  v_new_unique_orgs int;
BEGIN
  FOR r IN
    SELECT id, supporting_evidence_ids, fragment_count, unique_orgs
    FROM public.strategic_signals
    WHERE status = 'active'
  LOOP
    v_checked := v_checked + 1;

    -- Prune to live fragment ids
    SELECT COALESCE(array_agg(f.id), ARRAY[]::uuid[])
      INTO v_pruned_ids
    FROM public.evidence_fragments f
    WHERE f.id = ANY(COALESCE(r.supporting_evidence_ids, ARRAY[]::uuid[]));

    v_dead := COALESCE(array_length(r.supporting_evidence_ids,1),0)
            - COALESCE(array_length(v_pruned_ids,1),0);
    v_pruned := v_pruned + GREATEST(v_dead, 0);

    v_new_frag_count := COALESCE(array_length(v_pruned_ids,1),0);

    -- Distinct source count: fragments -> source_registry -> distinct source_id
    -- fallback to registry id when source_id is null
    SELECT COUNT(DISTINCT COALESCE(sr.source_id::text, sr.id::text))
      INTO v_new_unique_orgs
    FROM public.evidence_fragments f
    JOIN public.source_registry sr ON sr.id = f.source_registry_id
    WHERE f.id = ANY(v_pruned_ids);

    v_new_unique_orgs := COALESCE(v_new_unique_orgs, 0);

    IF v_dead > 0
       OR COALESCE(r.fragment_count,0) <> v_new_frag_count
       OR COALESCE(r.unique_orgs,0)    <> v_new_unique_orgs THEN
      UPDATE public.strategic_signals
      SET supporting_evidence_ids = v_pruned_ids,
          fragment_count = v_new_frag_count,
          unique_orgs    = v_new_unique_orgs,
          updated_at     = now()
      WHERE id = r.id;
      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  -- Always log so silence != breakage
  INSERT INTO public.ef_error_log (function_name, severity, error_message, context)
  VALUES (
    'reconcile-signal-counts',
    CASE WHEN v_fixed > 0 THEN 'info' ELSE 'debug' END,
    'SIGNAL_COUNT_RECONCILE',
    jsonb_build_object(
      'signals_checked', v_checked,
      'signals_fixed',   v_fixed,
      'dead_ids_pruned', v_pruned,
      'ran_at',          now()
    )
  );

  RETURN QUERY SELECT v_checked, v_fixed, v_pruned;
END;
$$;

-- Schedule daily at 07:25 UTC (10 min after publish-invariants-check at 07:15)
SELECT cron.schedule(
  'reconcile-signal-counts-daily',
  '25 7 * * *',
  $cron$ SELECT public.reconcile_signal_counts(); $cron$
);

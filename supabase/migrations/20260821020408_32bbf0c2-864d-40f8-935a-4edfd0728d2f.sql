-- Harden the 'failed_publishes' predicate inside public.founder_brief_data().
-- Only a genuine publish attempt may be reported: a real attempt always carries
-- a publish_correlation_id (written by publishTelemetry) and a publish_attempted_at
-- distinct from created_at. Orphaned aura_card image shares carry neither.
-- Every other key of the function is preserved byte-identical by patching the
-- stored definition in place.
DO $do$
DECLARE
  d text;
  old_block text;
  new_block text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'founder_brief_data' AND pronamespace = 'public'::regnamespace;
  IF d IS NULL THEN RAISE EXCEPTION 'founder_brief_data not found'; END IF;

  old_block := $old$        'date', to_char(lp.created_at,'DD Mon'),$old$;
  new_block := $new$        'date', to_char(lp.created_at,'DD Mon HH24:MI'),$new$;
  IF position(old_block in d) = 0 THEN RAISE EXCEPTION 'date expression not found'; END IF;
  d := replace(d, old_block, new_block);

  old_block := $old$      WHERE lp.user_id = ANY(ru) AND lp.tracking_status = 'failed'), '[]'::jsonb),$old$;
  new_block := $new$      WHERE lp.user_id = ANY(ru) AND lp.tracking_status = 'failed'
        AND coalesce(lp.content_type,'') <> 'aura_card'
        AND coalesce(lp.source_metadata->>'origin','') <> 'aura_card'
        AND lp.source_metadata->>'publish_correlation_id' IS NOT NULL
        AND lp.publish_attempted_at IS DISTINCT FROM lp.created_at), '[]'::jsonb),$new$;
  IF position(old_block in d) = 0 THEN RAISE EXCEPTION 'failed_publishes predicate not found'; END IF;
  d := replace(d, old_block, new_block);

  EXECUTE d;
END
$do$;
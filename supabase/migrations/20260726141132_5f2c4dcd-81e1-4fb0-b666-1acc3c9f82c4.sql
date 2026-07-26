DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname = 'founder_brief_data' AND pronamespace = 'public'::regnamespace;
  IF d IS NULL THEN RAISE EXCEPTION 'founder_brief_data not found'; END IF;
  IF position('lp.content' in d) = 0 THEN RAISE NOTICE 'nothing to patch'; RETURN; END IF;
  d := replace(d, 'left(coalesce(lp.content,''''),60)', 'left(coalesce(nullif(lp.title,''''), lp.post_text, lp.hook, ''''),60)');
  EXECUTE d;
END
$mig$;
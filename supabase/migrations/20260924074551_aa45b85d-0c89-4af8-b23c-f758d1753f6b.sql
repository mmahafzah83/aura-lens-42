DO $do$
DECLARE v text;
BEGIN
  v := pg_get_functiondef('public.oe_classify_work_arrangement(text,text,text,jsonb)'::regprocedure);
  v := replace(v, '|sort by|filter by|save job|view job|job nature', '|sort by|filter by|job nature');
  EXECUTE v;
END $do$;
REVOKE EXECUTE ON FUNCTION public.oe_classify_work_arrangement(text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
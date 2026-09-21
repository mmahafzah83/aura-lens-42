CREATE OR REPLACE FUNCTION public.oe_classify_kind_probe(p jsonb)
RETURNS text LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE o public.oe_opportunities%ROWTYPE;
BEGIN
  o := jsonb_populate_record(NULL::public.oe_opportunities, p);
  RETURN public.oe_classify_kind(o);
END $$;

REVOKE ALL ON FUNCTION public.oe_classify_kind_probe(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_classify_kind_probe(jsonb) TO service_role;
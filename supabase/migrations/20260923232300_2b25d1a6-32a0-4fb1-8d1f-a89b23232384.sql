CREATE OR REPLACE FUNCTION public.oe_route_on_issuer_site(p_opp uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host text; v_label text; s text; l text; v_sites text[]; v_names text[];
        v_idom text; v_iname text;
BEGIN
  SELECT public.oe_host_of(o.route_url), public.oe_host_of(i.domain),
         regexp_replace(lower(COALESCE(i.canonical_name, o.issuer_raw, '')),'[^a-z0-9]','','g')
    INTO v_host, v_idom, v_iname
    FROM oe_opportunities o LEFT JOIN oe_issuers i ON i.id = o.issuer_id
   WHERE o.id = p_opp;
  IF v_host IS NULL THEN RETURN false; END IF;
  v_label := public.oe_reg_label(v_host);

  SELECT array_remove(ARRAY[v_idom] || COALESCE(array_agg(public.oe_host_of(e.domain)),'{}') || COALESCE(array_agg(public.oe_host_of(e.careers_url)),'{}'), NULL),
         array_remove(ARRAY[v_iname] || COALESCE(array_agg(regexp_replace(lower(COALESCE(e.name,'')),'[^a-z0-9]','','g')),'{}'), '')
    INTO v_sites, v_names
    FROM oe_entities e
   WHERE (v_iname <> '' AND regexp_replace(lower(COALESCE(e.name,'')),'[^a-z0-9]','','g') = v_iname)
      OR (v_idom IS NOT NULL AND public.oe_host_of(e.domain) = v_idom)
      OR public.oe_host_of(e.careers_url) = v_host;

  FOREACH s IN ARRAY COALESCE(v_sites,'{}') LOOP
    IF v_host = s OR v_host LIKE '%.' || s OR s LIKE '%.' || v_host THEN RETURN true; END IF;
    l := public.oe_reg_label(s);
    IF length(l) >= 2 AND v_label IN (l, l||'careers', 'careers'||l, l||'jobs', 'jobs'||l, l||'talent') THEN RETURN true; END IF;
  END LOOP;
  FOREACH l IN ARRAY COALESCE(v_names,'{}') LOOP
    IF length(l) >= 3 AND v_label IN (l, l||'careers', 'careers'||l, l||'jobs', 'jobs'||l) THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.oe_route_on_issuer_site(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_route_on_issuer_site(uuid) TO service_role;
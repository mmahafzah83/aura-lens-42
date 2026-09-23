CREATE OR REPLACE FUNCTION public.oe_host_of(p_url text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(lower(split_part(regexp_replace(COALESCE(p_url,''),'^[a-zA-Z]+://',''),'/',1)),'^www\.|:\d+$','','g'),'')
$$;

CREATE OR REPLACE FUNCTION public.oe_reg_label(p_host text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE parts text[]; n int;
BEGIN
  IF p_host IS NULL OR p_host = '' THEN RETURN NULL; END IF;
  parts := string_to_array(p_host, '.'); n := array_length(parts,1);
  IF n IS NULL OR n < 2 THEN RETURN p_host; END IF;
  IF n >= 3 AND length(parts[n]) = 2 AND parts[n-1] IN ('com','co','gov','org','net','edu','ac','sch','mil') THEN
    RETURN parts[n-2];
  END IF;
  RETURN parts[n-1];
END $$;

-- Is this opportunity's route on the issuer's own site? Own domain, the
-- entity's careers host, or a host whose registrable name is the employer's
-- name with a careers/jobs affix (adcbcareers.com for adcb.com).
CREATE OR REPLACE FUNCTION public.oe_route_on_issuer_site(p_opp uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host text; v_label text; s text; l text; v_sites text[]; v_names text[];
BEGIN
  SELECT public.oe_host_of(o.route_url),
         array_remove(ARRAY[public.oe_host_of(i.domain), public.oe_host_of(e.domain), public.oe_host_of(e.careers_url)], NULL),
         array_remove(ARRAY[regexp_replace(lower(COALESCE(e.name,'')),'[^a-z0-9]','','g'),
                            regexp_replace(lower(COALESCE(i.canonical_name,'')),'[^a-z0-9]','','g')], '')
    INTO v_host, v_sites, v_names
    FROM oe_opportunities o
    LEFT JOIN oe_issuers i ON i.id = o.issuer_id
    LEFT JOIN oe_entities e ON e.id = COALESCE(o.entity_id, (SELECT e2.id FROM oe_entities e2 WHERE e2.id = o.entity_id))
   WHERE o.id = p_opp;
  IF v_host IS NULL THEN RETURN false; END IF;
  v_label := public.oe_reg_label(v_host);
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

-- An application route on the issuer's own site is an identified route; a
-- screen survivor with one is an act-lane record.
CREATE OR REPLACE FUNCTION public.oe_promote_issuer_routes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_opps int := 0; v_matches int := 0;
BEGIN
  UPDATE oe_opportunities o SET access_state = 'identified_route',
         access_state_reason = 'application on the employer''s own site',
         access_state_at = now()
   WHERE o.alive AND o.access_state IS NULL AND o.route_kind = 'application'
     AND o.route_url IS NOT NULL AND COALESCE(o.route_dead,false) = false
     AND public.oe_route_on_issuer_site(o.id);
  GET DIAGNOSTICS v_opps = ROW_COUNT;

  UPDATE oe_matches m SET lane_final = 'act'
    FROM oe_opportunities o
   WHERE o.id = m.opportunity_id AND o.alive
     AND o.access_state = 'identified_route' AND o.route_kind = 'application'
     AND COALESCE(o.route_dead,false) = false
     AND m.screen_outcome = 'survivor' AND m.gate_passed = true
     AND m.lane_final IS NULL AND COALESCE(m.eligibility_outcome,'') <> 'excluded';
  GET DIAGNOSTICS v_matches = ROW_COUNT;
  RETURN jsonb_build_object('opportunities', v_opps, 'matches', v_matches);
END $$;

REVOKE ALL ON FUNCTION public.oe_route_on_issuer_site(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.oe_promote_issuer_routes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_route_on_issuer_site(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.oe_promote_issuer_routes() TO service_role;
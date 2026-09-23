CREATE OR REPLACE FUNCTION public.oe_promote_issuer_routes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET statement_timeout = '120s' AS $$
DECLARE v_opps int := 0; v_matches int := 0;
BEGIN
  WITH ent AS (
    SELECT NULLIF(regexp_replace(lower(COALESCE(e.name,'')),'[^a-z0-9]','','g'),'') AS nm,
           public.oe_host_of(e.domain) AS dom, public.oe_host_of(e.careers_url) AS car
      FROM oe_entities e
  ), cand AS (
    SELECT o.id, public.oe_host_of(o.route_url) AS host,
           public.oe_host_of(i.domain) AS idom,
           NULLIF(regexp_replace(lower(COALESCE(i.canonical_name, o.issuer_raw, '')),'[^a-z0-9]','','g'),'') AS iname
      FROM oe_opportunities o LEFT JOIN oe_issuers i ON i.id = o.issuer_id
     WHERE o.alive AND o.access_state IS NULL AND o.route_kind = 'application'
       AND o.route_url IS NOT NULL AND COALESCE(o.route_dead,false) = false
  ), sites AS (
    SELECT c.id, c.host, public.oe_reg_label(c.host) AS lbl, s.site, s.nm
      FROM cand c
      CROSS JOIN LATERAL (
        SELECT c.idom AS site, c.iname AS nm
        UNION ALL
        SELECT x.site, e.nm FROM ent e
          CROSS JOIN LATERAL (VALUES (e.dom), (e.car)) x(site)
         WHERE (c.iname IS NOT NULL AND e.nm = c.iname)
            OR (c.idom IS NOT NULL AND e.dom = c.idom)
            OR e.car = c.host
      ) s
  ), ok AS (
    SELECT DISTINCT id FROM sites
     WHERE host IS NOT NULL AND (
       (site IS NOT NULL AND (host = site OR host LIKE '%.' || site OR site LIKE '%.' || host
          OR (length(public.oe_reg_label(site)) >= 2 AND lbl IN (public.oe_reg_label(site), public.oe_reg_label(site)||'careers',
              'careers'||public.oe_reg_label(site), public.oe_reg_label(site)||'jobs', 'jobs'||public.oe_reg_label(site), public.oe_reg_label(site)||'talent'))))
       OR (length(COALESCE(nm,'')) >= 3 AND lbl IN (nm, nm||'careers', 'careers'||nm, nm||'jobs', 'jobs'||nm)))
  )
  UPDATE oe_opportunities o SET access_state = 'identified_route',
         access_state_reason = 'application on the employer''s own site',
         access_state_at = now()
    FROM ok WHERE o.id = ok.id;
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
REVOKE ALL ON FUNCTION public.oe_promote_issuer_routes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_promote_issuer_routes() TO service_role;
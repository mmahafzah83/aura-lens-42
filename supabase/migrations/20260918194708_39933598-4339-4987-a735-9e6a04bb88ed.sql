CREATE OR REPLACE FUNCTION public.oe_refresh_purpose(p_user uuid)
 RETURNS TABLE(opportunity_id uuid, purpose text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_priority text;
  v_core text[];
  v_level text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()<>p_user AND NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT d.priority INTO v_priority FROM oe_direction d WHERE d.user_id=p_user;
  v_priority:=COALESCE(v_priority,'bigger_seat');
  SELECT COALESCE(e.sectors_core,'{}'::text[]),e.level_now INTO v_core,v_level FROM oe_eligibility e WHERE e.user_id=p_user;

  WITH latest AS (
    SELECT DISTINCT ON (m.opportunity_id) m.id,m.opportunity_id,m.scores
    FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
    WHERE m.user_id=p_user AND o.alive
    ORDER BY m.opportunity_id,m.judged_at DESC
  ), facts AS (
    SELECT l.id,l.opportunity_id,o.chair_type,o.discovery_kind,o.sector,o.level_band,
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(v_core,'{}'::text[])) s
        WHERE replace(lower(COALESCE(o.sector,'')),' ','_') LIKE '%'||lower(s)||'%'
           OR lower(s) LIKE '%'||replace(lower(COALESCE(o.sector,'')),' ','_')||'%'
      ) AS core_sector,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(l.scores->'cites','[]'::jsonb)) c
        WHERE c->>'id' ~* '^[0-9a-f-]{36}$'
          AND (
            EXISTS (SELECT 1 FROM oe_faces f WHERE f.user_id=p_user AND f.id=(c->>'id')::uuid)
            OR EXISTS (SELECT 1 FROM evidence_fragments ev WHERE ev.user_id=p_user AND ev.id=(c->>'id')::uuid)
          )
      ) AS has_cited_evidence
    FROM latest l JOIN oe_opportunities o ON o.id=l.opportunity_id
  ), classified AS (
    SELECT f.*,
      CASE
        WHEN f.core_sector OR f.has_cited_evidence THEN 'strength'
        WHEN v_priority='bigger_seat' AND f.level_band=(CASE v_level WHEN 'ic' THEN 'manager' WHEN 'manager' THEN 'senior_manager' WHEN 'senior_manager' THEN 'director' WHEN 'director' THEN 'senior_director' WHEN 'senior_director' THEN 'vp' WHEN 'vp' THEN 'c_suite' WHEN 'c_suite' THEN 'board' END) THEN 'build'
        WHEN v_priority='known_for_one' AND f.chair_type IN ('speaking','media','learning') THEN 'build'
        WHEN v_priority='new_rooms' AND (f.chair_type IN ('room','advisory') OR f.discovery_kind='corporate_event_inference') THEN 'build'
        WHEN v_priority='out_of_sector' AND NOT f.core_sector THEN 'build'
        ELSE 'explore'
      END AS new_purpose
    FROM facts f
  )
  UPDATE oe_matches m SET purpose=c.new_purpose
  FROM classified c WHERE m.id=c.id AND m.purpose IS DISTINCT FROM c.new_purpose;

  RETURN QUERY SELECT m.opportunity_id,m.purpose FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
    WHERE m.user_id=p_user AND o.alive AND m.judged_at=(SELECT max(x.judged_at) FROM oe_matches x WHERE x.user_id=p_user AND x.opportunity_id=m.opportunity_id)
    ORDER BY m.opportunity_id;
END $function$;
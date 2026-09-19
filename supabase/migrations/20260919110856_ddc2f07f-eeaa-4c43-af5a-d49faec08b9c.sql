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
  v_level_i int;
  v_ladder text[] := ARRAY['ic','manager','senior_manager','director','senior_director','vp','c_suite','board'];
  v_fn_re text := '(transform|digital|govern|operating model|operating-model|strategy|strategic|infrastructure|technolog|\mIT\M|data|\mAI\M|artificial intelligence|program management|portfolio|pmo|change management|modernis|moderniz|policy|regulat|board|committee|advisor|تحول|رقمي|رقمنة|حوكمة|استراتيج|بنية تحتية|تقنية|بيانات|الذكاء الاصطناعي|مجلس إدارة|لجنة|سياسات|تنظيم|تشغيل)';
  v_sector_re text := '(energy|utilit|water|power|electric|renewab|government|public sector|public-sector|municipal|logistic|transport|supply chain|infrastructure|oil|gas|petro|mining|smart cit|طاقة|مياه|كهرباء|حكوم|قطاع عام|لوجست|نقل|سلسلة الإمداد|بنية تحتية|تعدين|نفط|غاز|بلدي)';
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid()<>p_user AND NOT public.is_current_user_admin() THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT d.priority INTO v_priority FROM oe_direction d WHERE d.user_id=p_user;
  v_priority:=COALESCE(v_priority,'bigger_seat');
  SELECT COALESCE(e.sectors_core,'{}'::text[]),e.level_now INTO v_core,v_level FROM oe_eligibility e WHERE e.user_id=p_user;
  v_level_i := array_position(v_ladder, v_level);

  WITH latest AS (
    SELECT DISTINCT ON (m.opportunity_id) m.id,m.opportunity_id,m.scores,m.eligibility_outcome
    FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
    WHERE m.user_id=p_user AND o.alive
    ORDER BY m.opportunity_id,m.judged_at DESC
  ), facts AS (
    SELECT l.id,l.opportunity_id,l.eligibility_outcome,o.chair_type,o.discovery_kind,o.sector,o.level_band,
      array_position(v_ladder, o.level_band) AS level_i,
      EXISTS (
        SELECT 1 FROM unnest(COALESCE(v_core,'{}'::text[])) s
        WHERE replace(lower(COALESCE(o.sector,'')),' ','_') LIKE '%'||lower(s)||'%'
           OR lower(s) LIKE '%'||replace(lower(COALESCE(o.sector,'')),' ','_')||'%'
      ) AS core_sector,
      (
        COALESCE(o.title,'') || ' ' || COALESCE(o.scope,'') ~* v_fn_re
        OR COALESCE(o.sector,'') ~* v_sector_re
      ) AS bridge,
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
        WHEN COALESCE(f.eligibility_outcome,'unknown') <> 'excluded'
             AND v_priority = 'bigger_seat'
             AND ((v_level_i IS NOT NULL AND f.level_i IS NOT NULL AND f.level_i > v_level_i) OR NOT f.core_sector)
             AND f.bridge
          THEN 'build'
        WHEN COALESCE(f.eligibility_outcome,'unknown') <> 'excluded' AND v_priority='known_for_one' AND f.chair_type IN ('speaking','media','learning') AND f.bridge THEN 'build'
        WHEN COALESCE(f.eligibility_outcome,'unknown') <> 'excluded' AND v_priority='new_rooms' AND (f.chair_type IN ('room','advisory') OR f.discovery_kind='corporate_event_inference') AND f.bridge THEN 'build'
        WHEN COALESCE(f.eligibility_outcome,'unknown') <> 'excluded' AND v_priority='out_of_sector' AND NOT f.core_sector AND f.bridge THEN 'build'
        WHEN f.core_sector OR f.has_cited_evidence THEN 'strength'
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
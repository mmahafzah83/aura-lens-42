
DROP FUNCTION IF EXISTS public.oe_investigate_unknowns(uuid);
CREATE OR REPLACE FUNCTION public.oe_investigate_unknowns(p_user uuid)
RETURNS TABLE(o_opportunity_id uuid, o_title text, o_field text, o_outcome text, o_detail text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_country text; v_allowed text[]; v_unknowns text[]; v_fails text[]; v_outcome text; v_detail text;
BEGIN
  SELECT countries_allowed INTO v_allowed FROM oe_eligibility WHERE user_id=p_user;
  v_allowed := COALESCE(v_allowed, '{}'::text[]);

  FOR r IN
    SELECT m.id match_id, o.id opp_id, o.title, o.location,
           COALESCE(m.eligibility_unknowns,'{}'::text[]) unk,
           COALESCE(m.eligibility_fail,'{}'::text[]) fails
      FROM oe_matches m JOIN oe_opportunities o ON o.id=m.opportunity_id
     WHERE m.user_id=p_user AND o.alive AND m.eligibility_outcome='unknown'
  LOOP
    v_unknowns := r.unk; v_fails := r.fails; v_outcome := NULL; v_detail := NULL;
    IF 'place_unknown' = ANY(r.unk) THEN
      v_country := public.oe_place_country(r.location);
      IF v_country IS NOT NULL AND v_country <> 'UNSPECIFIED' THEN
        v_unknowns := array_remove(v_unknowns,'place_unknown');
        IF array_length(v_allowed,1) IS NOT NULL AND NOT (v_country = ANY(v_allowed)) THEN
          v_fails := (SELECT array_agg(DISTINCT x) FROM unnest(v_fails || ARRAY['place']) x);
          v_outcome := 'excluded';
          v_detail := 'Stated location resolves to '||v_country||', outside the countries he works in';
        ELSE
          v_detail := 'Stated location resolves to '||v_country||', inside the countries he works in';
        END IF;
        INSERT INTO oe_investigations AS inv (user_id,opportunity_id,field,status,attempts,resolved_value,reason,last_attempt_at)
        VALUES (p_user,r.opp_id,'place','resolved',1,v_country,v_detail,now())
        ON CONFLICT (user_id,opportunity_id,field) DO UPDATE
          SET status='resolved', attempts=inv.attempts+1, resolved_value=EXCLUDED.resolved_value,
              reason=EXCLUDED.reason, last_attempt_at=now();
      ELSE
        v_outcome := 'unknown';
        v_detail := 'Location is stated only as "'||COALESCE(r.location,'(nothing)')||'"';
        INSERT INTO oe_investigations AS inv (user_id,opportunity_id,field,status,attempts,reason,last_attempt_at)
        VALUES (p_user,r.opp_id,'place','open',1,v_detail,now())
        ON CONFLICT (user_id,opportunity_id,field) DO UPDATE
          SET attempts=inv.attempts+1, reason=EXCLUDED.reason, last_attempt_at=now();
      END IF;
    END IF;

    IF v_outcome IS NULL THEN
      v_outcome := CASE WHEN array_length(v_unknowns,1) IS NULL THEN 'eligible' ELSE 'unknown' END;
    END IF;

    UPDATE oe_matches SET eligibility_unknowns=v_unknowns, eligibility_fail=v_fails, eligibility_outcome=v_outcome
     WHERE id=r.match_id;

    o_opportunity_id := r.opp_id; o_title := r.title; o_field := 'place'; o_outcome := v_outcome; o_detail := v_detail;
    RETURN NEXT;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.oe_investigate_unknowns(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_investigate_unknowns(uuid) TO service_role;

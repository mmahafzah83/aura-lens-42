CREATE OR REPLACE FUNCTION public.oe_matches_act_requires_route()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_state text; v_kind text; v_route_kind text; v_route_dead boolean;
BEGIN
  IF NEW.lane_final = 'act' THEN
    SELECT o.access_state, o.kind, o.route_kind, COALESCE(o.route_dead,false)
      INTO v_state, v_kind, v_route_kind, v_route_dead
      FROM oe_opportunities o WHERE o.id = NEW.opportunity_id;

    IF NEW.member_access_confirmed IS NOT TRUE
       AND v_kind IN ('professional_membership','speaking_platform','award_judging','authoring_publication','executive_teaching')
       AND v_route_kind IN ('registration','application','form')
       AND v_route_dead IS NOT TRUE THEN
      NEW.member_access_confirmed := true;
      NEW.member_access_basis := 'route_is_public';
    END IF;

    -- No door the member can walk through means it is not an act. It does NOT
    -- mean it is writing material: the four writing tests decide that on their
    -- own, so the lane is cleared here and left for them.
    IF COALESCE(v_state,'observed_event') <> 'identified_route' AND NEW.member_access_confirmed IS NOT TRUE THEN
      NEW.lane_final := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $function$;
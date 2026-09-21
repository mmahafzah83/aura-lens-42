ALTER TABLE public.oe_matches ADD COLUMN IF NOT EXISTS member_access_basis text;

CREATE OR REPLACE FUNCTION public.oe_matches_act_requires_route()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_state text; v_kind text; v_route_kind text; v_route_dead boolean;
BEGIN
  IF NEW.lane_final = 'act' THEN
    SELECT o.access_state, o.kind, o.route_kind, COALESCE(o.route_dead,false)
      INTO v_state, v_kind, v_route_kind, v_route_dead
      FROM oe_opportunities o WHERE o.id = NEW.opportunity_id;

    -- A live public registration/application/form route on an admission-type kind
    -- is itself the confirmation; there is nothing further to confirm.
    IF NEW.member_access_confirmed IS NOT TRUE
       AND v_kind IN ('professional_membership','speaking_platform','award_judging','authoring_publication','executive_teaching')
       AND v_route_kind IN ('registration','application','form')
       AND v_route_dead IS NOT TRUE THEN
      NEW.member_access_confirmed := true;
      NEW.member_access_basis := 'route_is_public';
    END IF;

    IF COALESCE(v_state,'observed_event') <> 'identified_route' AND NEW.member_access_confirmed IS NOT TRUE THEN
      NEW.lane_final := 'write';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Re-run the lane computation for existing matches: re-present every gated, open-lane
-- match so the trigger re-decides act vs write under the new rule.
UPDATE oe_matches m
   SET lane_final = 'act'
  FROM oe_opportunities o
 WHERE o.id = m.opportunity_id
   AND m.gate_passed IS TRUE
   AND m.lane = 'lane_open'
   AND m.lane_final <> 'act';
CREATE OR REPLACE FUNCTION public.oe_classify_work_arrangement(
  p_title text, p_location text, p_page text, p_structured jsonb,
  OUT arrangement text, OUT basis text, OUT quote text, OUT regions text[])
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_s text; v_isr text; v_sent text; v_perk boolean := false;
  v_hyb text; v_rem text; v_ons text; v_pos int;
  c_hyb constant text := '(hybrid|flexible work|flexibility to work remotely|remote working option|remote-friendly|remote friendly|work from home (option|day|allowance)|days? ?(a|per|/)? ?(week )?(in|at|from) ?(the |our )?office|in-office requirement|days? in (the )?office|هجين|عمل مرن)';
  c_rem constant text := '(fully remote|100% remote|remote[- ]first|remote[- ]only|work from anywhere|work from home|work remotely|remote (role|position|job|opportunity)|(role|position) is remote|remote within|remote in |remote across|work mode:? remote|عن بعد بالكامل|العمل عن بعد)';
  c_ons constant text := '(on-?site|office-based|office based|in-office|fully office|based (in|at|out of) (our|the) [a-z ]{0,40}office|حضوري)';
  c_perk_head constant text := '(benefit|perk|what we offer|we offer|why join|why work|love working|our culture|life at|employee value|total reward|rewards|package|in it for you|about us|about the company|المزايا|لماذا تنضم)';
  c_perk constant text := '(benefit|perk|we offer|offers? (a |an |competitive|flexible|attractive)|offering|work-life|work life balance|wellbeing|well-being|insurance|annual leave|paid leave|discount|allowance|eligib|subject to|culture|we understand|we value|our people|compensation|reward|equal opportunit)';
  -- search-page furniture: facet lists, buttons, sort controls, other listings
  c_noise constant text := '(button|expand ?/ ?collapse|sort by|filter by|save job|view job|job nature|type of contract|results found|refine)';
  c_role_head constant text := '(responsibilit|requirement|qualification|what you will do|you will|the role|key accountab|duties|job description|looking for|المهام|المتطلبات)';
BEGIN
  arrangement := 'unknown'; basis := NULL; quote := NULL; regions := '{}';

  IF p_structured IS NOT NULL AND jsonb_typeof(p_structured) = 'object' THEN
    v_s := lower(coalesce(p_structured->>'jobLocationType', p_structured->>'workplaceType',
                          p_structured->>'workplace_type', p_structured->>'workplace', ''));
    v_isr := lower(coalesce(p_structured->>'isRemote', p_structured->>'remote', ''));
    IF v_s ~ 'hybrid' THEN arrangement := 'hybrid';
    ELSIF v_s ~ '(telecommute|remote)' OR v_isr = 'true' THEN arrangement := 'remote';
    ELSIF v_s ~ '(on.?site|office)' OR v_isr = 'false' THEN arrangement := 'onsite';
    END IF;
    IF arrangement <> 'unknown' THEN
      basis := 'structured';
      quote := left(nullif(trim(concat_ws(' ', nullif(v_s,''), CASE WHEN v_isr <> '' THEN 'isRemote=' || v_isr END)),''), 300);
      IF arrangement = 'remote' AND p_structured ? 'applicantLocationRequirements' THEN
        regions := public.oe_regions_in_text(p_structured->>'applicantLocationRequirements');
      END IF;
      RETURN;
    END IF;
  END IF;

  IF coalesce(p_title,'') ~* c_hyb THEN arrangement := 'hybrid'; basis := 'title'; quote := left(p_title,300); RETURN; END IF;
  IF coalesce(p_title,'') ~* '(\mremote\M|work from home|\mwfh\M|work from anywhere|عن بعد)' THEN
    arrangement := 'remote'; basis := 'title'; quote := left(p_title,300);
    regions := public.oe_regions_in_text(p_title || ' ' || coalesce(p_location,'')); RETURN;
  END IF;
  IF coalesce(p_location,'') ~* c_hyb THEN arrangement := 'hybrid'; basis := 'location_field'; quote := left(p_location,300); RETURN; END IF;
  IF coalesce(p_location,'') ~* '(\mremote\M|work from home|^\s*anywhere\s*$|anywhere in the world|عن بعد)' THEN
    arrangement := 'remote'; basis := 'location_field'; quote := left(p_location,300);
    regions := public.oe_regions_in_text(regexp_replace(p_location,'remote|anywhere',' ','gi')); RETURN;
  END IF;
  IF coalesce(p_location,'') ~* c_ons THEN arrangement := 'onsite'; basis := 'location_field'; quote := left(p_location,300); RETURN; END IF;

  FOR v_sent IN SELECT trim(x) FROM regexp_split_to_table(coalesce(p_page,''), '[.!?•|·]\s+|\n+|\s{2,}|#+\s|\s\*\s') x LOOP
    CONTINUE WHEN length(v_sent) < 4;
    IF length(v_sent) < 90 AND v_sent ~* c_role_head THEN v_perk := false;
    ELSIF length(v_sent) < 120 AND v_sent ~* c_perk_head THEN v_perk := true;
    END IF;
    CONTINUE WHEN v_perk OR v_sent ~* c_perk OR v_sent ~* c_noise;
    IF v_hyb IS NULL AND v_sent ~* c_hyb THEN
      v_pos := regexp_instr(v_sent, c_hyb, 1, 1, 0, 'i');
      v_hyb := substr(v_sent, greatest(1, v_pos - 140), 280);
    ELSIF v_rem IS NULL AND v_sent ~* c_rem THEN
      v_pos := regexp_instr(v_sent, c_rem, 1, 1, 0, 'i');
      v_rem := substr(v_sent, greatest(1, v_pos - 140), 280);
    ELSIF v_ons IS NULL AND v_sent ~* c_ons THEN
      v_pos := regexp_instr(v_sent, c_ons, 1, 1, 0, 'i');
      v_ons := substr(v_sent, greatest(1, v_pos - 140), 280);
    END IF;
  END LOOP;
  IF v_hyb IS NOT NULL THEN arrangement := 'hybrid'; quote := v_hyb;
  ELSIF v_rem IS NOT NULL THEN arrangement := 'remote'; quote := v_rem;
    regions := public.oe_regions_in_text(v_rem);
  ELSIF v_ons IS NOT NULL THEN arrangement := 'onsite'; quote := v_ons;
  END IF;
  IF arrangement <> 'unknown' THEN basis := 'role_text'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.oe_classify_work_arrangement(text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
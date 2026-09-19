-- 1. A comment and a rule are different objects.
UPDATE public.oe_notebook
SET entry_kind = 'comment', ratified_at = NULL, derived_from = '{}'::jsonb
WHERE origin = 'stated';

CREATE UNIQUE INDEX IF NOT EXISTS oe_notebook_rule_unique
  ON public.oe_notebook (user_id, field, op, value) WHERE entry_kind = 'rule';

-- 2. Derive rules from comments plus the profile. Only a ratified rule executes.
CREATE OR REPLACE FUNCTION public.oe_derive_rules(p_user uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_added integer := 0; v_nat text;
BEGIN
  SELECT nationality INTO v_nat FROM oe_eligibility WHERE user_id = p_user;

  -- Place and sector: the member already said yes to these sentences, so the
  -- derived rule carries their ratification and the sentence it came from.
  INSERT INTO public.oe_notebook (user_id, entry_kind, kind, field, op, value, rule_text,
                                  origin, proposal_status, stated_on, active, ratified_at, derived_from)
  SELECT c.user_id, 'rule', 'hard', c.field, c.op, c.value,
         CASE c.field WHEN 'place' THEN 'Work in ' || c.value || ' only'
                      ELSE 'Core sector: ' || replace(c.value, '_', ' ') END,
         'derived',
         CASE WHEN c.active AND c.proposal_status = 'signed' THEN 'signed' ELSE 'open' END,
         c.stated_on, true,
         CASE WHEN c.active AND c.proposal_status = 'signed' THEN c.created_at ELSE NULL END,
         jsonb_build_object('comments', jsonb_build_array(jsonb_build_object('id', c.id, 'text', c.rule_text, 'said_on', c.stated_on)))
  FROM public.oe_notebook c
  WHERE c.user_id = p_user AND c.entry_kind = 'comment' AND c.field IN ('place','sector') AND c.value IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  -- A board comment carries two separate facts. Neither is a level ceiling.
  INSERT INTO public.oe_notebook (user_id, entry_kind, kind, field, op, value, rule_text,
                                  origin, proposal_status, stated_on, active, ratified_at, derived_from)
  SELECT c.user_id, 'rule', 'hard', 'chair_type', 'never_held', 'board',
         'Has not served on a board before', 'derived', 'signed', c.stated_on, true, c.created_at,
         jsonb_build_object(
           'comments', jsonb_build_array(jsonb_build_object('id', c.id, 'text', c.rule_text, 'said_on', c.stated_on)),
           'profile', jsonb_build_array('oe_faces.done'))
  FROM public.oe_notebook c
  WHERE c.user_id = p_user AND c.entry_kind = 'comment' AND c.field = 'chair_type' AND c.value = 'board'
  ON CONFLICT DO NOTHING;

  IF v_nat IS NOT NULL AND upper(v_nat) <> 'SA' THEN
    INSERT INTO public.oe_notebook (user_id, entry_kind, kind, field, op, value, rule_text,
                                    origin, proposal_status, stated_on, active, ratified_at, derived_from)
    VALUES (p_user, 'rule', 'hard', 'requirement', 'exclude', 'saudi_nationality',
            'Cannot take a seat that states Saudi nationality as a requirement',
            'derived', 'signed', CURRENT_DATE, true, now(),
            jsonb_build_object(
              'profile', jsonb_build_array('oe_eligibility.nationality = ' || upper(v_nat)),
              'legal_basis', 'Saudi Companies Law and CMA listing rules: certain listed-company board seats are reserved for Saudi nationals where the record states it.',
              'comments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'text', c.rule_text, 'said_on', c.stated_on))
                                    FROM public.oe_notebook c
                                    WHERE c.user_id = p_user AND c.entry_kind = 'comment' AND c.value = 'board'), '[]'::jsonb)))
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_added;
END $$;

REVOKE ALL ON FUNCTION public.oe_derive_rules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_derive_rules(uuid) TO service_role;

-- 3. The cache is rebuilt from ratified rules only. No level ever filters.
CREATE OR REPLACE FUNCTION public.oe_rebuild_eligibility(p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_places text[]; v_blocked text[]; v_never text[]; v_sectors text[];
  v_reasons jsonb; v_rules jsonb;
BEGIN
  SELECT array_agg(DISTINCT upper(value)) INTO v_places FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'rule' AND active AND ratified_at IS NOT NULL
      AND field = 'place' AND op = 'require' AND value IS NOT NULL;
  SELECT array_agg(DISTINCT value) INTO v_blocked FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'rule' AND active AND ratified_at IS NOT NULL
      AND field = 'chair_type' AND op = 'exclude' AND value IS NOT NULL;
  SELECT array_agg(DISTINCT value) INTO v_never FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'rule' AND active AND ratified_at IS NOT NULL
      AND field = 'chair_type' AND op = 'never_held' AND value IS NOT NULL;
  SELECT array_agg(DISTINCT value) INTO v_sectors FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'rule' AND active AND ratified_at IS NOT NULL
      AND field = 'sector' AND op IN ('prefer','require') AND value IS NOT NULL;
  SELECT jsonb_object_agg(value, rule_text) INTO v_reasons FROM (
    SELECT DISTINCT ON (value) value, rule_text FROM oe_notebook
      WHERE user_id = p_user AND entry_kind = 'rule' AND active AND ratified_at IS NOT NULL
        AND field = 'chair_type' AND op = 'exclude' AND value IS NOT NULL
      ORDER BY value, stated_on DESC) s;
  -- The member's own sentences, verbatim, are what the drawer shows.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'said_on', stated_on, 'text', rule_text,
           'applies_to', COALESCE(field,'') || ':' || COALESCE(value,'')) ORDER BY stated_on), '[]'::jsonb)
    INTO v_rules FROM oe_notebook
    WHERE user_id = p_user AND entry_kind = 'comment' AND active;

  INSERT INTO oe_eligibility (user_id, countries_allowed, chair_types_blocked, chair_types_never_held,
                              level_ceiling, level_floor, sectors_core, blocked_reasons, stated_rules)
  VALUES (p_user, COALESCE(v_places, '{}'), COALESCE(v_blocked, '{}'), COALESCE(v_never, '{}'),
          NULL, NULL, COALESCE(v_sectors, '{}'), COALESCE(v_reasons, '{}'::jsonb), v_rules)
  ON CONFLICT (user_id) DO UPDATE SET
    countries_allowed      = COALESCE(v_places, '{}'),
    chair_types_blocked    = COALESCE(v_blocked, '{}'),
    chair_types_never_held = COALESCE(v_never, '{}'),
    level_ceiling          = NULL,
    level_floor            = NULL,
    sectors_core           = COALESCE(v_sectors, '{}'),
    blocked_reasons        = COALESCE(v_reasons, '{}'::jsonb),
    stated_rules           = v_rules,
    updated_at             = now();
END $function$;

-- 4. Owner-only reading of the orphan report.
CREATE OR REPLACE FUNCTION public.oe_eligibility_orphans(p_user uuid)
RETURNS TABLE(field text, value text, reason text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY
  WITH r AS (
    SELECT n.field, n.op, n.value FROM oe_notebook n
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.ratified_at IS NOT NULL
  ), e AS (SELECT * FROM oe_eligibility WHERE user_id = p_user)
  SELECT 'countries_allowed', c, 'no ratified rule' FROM e, unnest(COALESCE(e.countries_allowed,'{}')) c
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='place' AND upper(r.value)=upper(c))
  UNION ALL
  SELECT 'sectors_core', s, 'no ratified rule' FROM e, unnest(COALESCE(e.sectors_core,'{}')) s
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='sector' AND r.value=s)
  UNION ALL
  SELECT 'chair_types_blocked', b, 'no ratified rule' FROM e, unnest(COALESCE(e.chair_types_blocked,'{}')) b
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='chair_type' AND r.op='exclude' AND r.value=b)
  UNION ALL
  SELECT 'chair_types_never_held', b, 'no ratified rule' FROM e, unnest(COALESCE(e.chair_types_never_held,'{}')) b
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='chair_type' AND r.op='never_held' AND r.value=b)
  UNION ALL
  SELECT 'level_ceiling', e.level_ceiling, 'level is no longer an exclusion' FROM e WHERE e.level_ceiling IS NOT NULL
  UNION ALL
  SELECT 'level_floor', e.level_floor, 'level is no longer an exclusion' FROM e WHERE e.level_floor IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.oe_eligibility_orphans(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_eligibility_orphans(uuid) TO authenticated, service_role;
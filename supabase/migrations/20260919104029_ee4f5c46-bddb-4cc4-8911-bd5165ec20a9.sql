ALTER TABLE public.oe_notebook
  ADD COLUMN IF NOT EXISTS entry_kind text NOT NULL DEFAULT 'rule',
  ADD COLUMN IF NOT EXISTS derived_from jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ratified_at timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oe_notebook_entry_kind_check') THEN
    ALTER TABLE public.oe_notebook ADD CONSTRAINT oe_notebook_entry_kind_check CHECK (entry_kind IN ('comment','rule'));
  END IF;
END $$;

UPDATE public.oe_notebook
SET ratified_at = COALESCE(ratified_at, created_at)
WHERE entry_kind = 'rule' AND active AND proposal_status = 'signed';

-- Every value held in the eligibility cache must trace back to a ratified rule.
CREATE OR REPLACE FUNCTION public.oe_eligibility_orphans(p_user uuid)
RETURNS TABLE(field text, value text, reason text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH r AS (
    SELECT n.field, n.op, n.value
    FROM oe_notebook n
    WHERE n.user_id = p_user AND n.entry_kind = 'rule' AND n.active AND n.ratified_at IS NOT NULL
  ), e AS (
    SELECT * FROM oe_eligibility WHERE user_id = p_user
  )
  SELECT 'countries_allowed', c, 'no ratified rule'
    FROM e, unnest(COALESCE(e.countries_allowed,'{}')) c
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='place' AND upper(r.value)=upper(c))
  UNION ALL
  SELECT 'sectors_core', s, 'no ratified rule'
    FROM e, unnest(COALESCE(e.sectors_core,'{}')) s
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='sector' AND r.value=s)
  UNION ALL
  SELECT 'chair_types_blocked', b, 'no ratified rule'
    FROM e, unnest(COALESCE(e.chair_types_blocked,'{}')) b
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='chair_type' AND r.op='exclude' AND r.value=b)
  UNION ALL
  SELECT 'chair_types_never_held', b, 'no ratified rule'
    FROM e, unnest(COALESCE(e.chair_types_never_held,'{}')) b
    WHERE NOT EXISTS (SELECT 1 FROM r WHERE r.field='chair_type' AND r.op='never_held' AND r.value=b)
  UNION ALL
  SELECT 'level_ceiling', e.level_ceiling, 'no ratified rule'
    FROM e WHERE e.level_ceiling IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM r WHERE r.field='level' AND r.op='exclude' AND r.value=e.level_ceiling)
  UNION ALL
  SELECT 'level_floor', e.level_floor, 'no ratified rule'
    FROM e WHERE e.level_floor IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM r WHERE r.field='level' AND r.op='floor' AND r.value=e.level_floor);
$$;

GRANT EXECUTE ON FUNCTION public.oe_eligibility_orphans(uuid) TO authenticated, service_role;
-- ── PART A — the move question ──────────────────────────────────────────────
ALTER TABLE public.oe_direction
  ADD COLUMN IF NOT EXISTS move_kind text,
  ADD COLUMN IF NOT EXISTS move_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS move_proposed text;

DO $$ BEGIN
  ALTER TABLE public.oe_direction
    ADD CONSTRAINT oe_direction_move_kind_check
    CHECK (move_kind IS NULL OR move_kind IN ('bigger_same','step_up','client_side','exceptional_only'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The guard already protects the goal. It now protects the move the same way:
-- only oe_goal_save / oe_move_save, only the member himself.
CREATE OR REPLACE FUNCTION public.oe_direction_goal_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.goal IS DISTINCT FROM COALESCE(OLD.goal, NULL) AND NEW.goal IS NOT NULL THEN
    IF COALESCE(current_setting('oe.goal_confirm', true), '') <> 'member' THEN
      RAISE EXCEPTION 'the goal is written only by the member confirming it (oe_goal_save)';
    END IF;
    IF NEW.goal_confirmed_at IS NULL OR NEW.goal_confirmed_at < now() - interval '1 minute' THEN
      RAISE EXCEPTION 'a goal must carry the moment the member confirmed it';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.goal IS NOT NULL AND NEW.goal IS NULL THEN
    IF COALESCE(current_setting('oe.goal_confirm', true), '') <> 'member' THEN
      RAISE EXCEPTION 'only the member may clear their own goal';
    END IF;
  END IF;

  IF (NEW.move_kind IS DISTINCT FROM COALESCE(OLD.move_kind, NULL)
      OR NEW.move_confirmed_at IS DISTINCT FROM COALESCE(OLD.move_confirmed_at, NULL))
     AND (NEW.move_kind IS NOT NULL OR NEW.move_confirmed_at IS NOT NULL) THEN
    IF COALESCE(current_setting('oe.goal_confirm', true), '') <> 'member' THEN
      RAISE EXCEPTION 'what would make you move is written only by the member confirming it (oe_move_save)';
    END IF;
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'a member writes only their own answer';
    END IF;
    IF NEW.move_confirmed_at IS NULL OR NEW.move_confirmed_at < now() - interval '1 minute' THEN
      RAISE EXCEPTION 'an answer must carry the moment the member confirmed it';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.oe_move_save(p_move text DEFAULT NULL, p_place text[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row oe_direction%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_move IS NOT NULL AND p_move NOT IN ('bigger_same','step_up','client_side','exceptional_only') THEN
    RAISE EXCEPTION 'unknown answer';
  END IF;

  IF p_move IS NOT NULL THEN
    PERFORM set_config('oe.goal_confirm', 'member', true);
    INSERT INTO oe_direction(user_id, move_kind, move_confirmed_at)
    VALUES (v_uid, p_move, now())
    ON CONFLICT (user_id) DO UPDATE SET
      move_kind = EXCLUDED.move_kind,
      move_confirmed_at = now(),
      updated_at = now()
    RETURNING * INTO v_row;
    PERFORM set_config('oe.goal_confirm', '', true);
  END IF;

  -- The place rule is created by the sanctioned writer, so it lands as a
  -- stated, ratified rule. Never a derived one.
  IF p_place IS NOT NULL AND array_length(p_place, 1) > 0 THEN
    PERFORM public.oe_filter_save('place', 'allow', p_place);
  END IF;

  RETURN COALESCE(to_jsonb(v_row), jsonb_build_object('ok', true));
END $function$;

REVOKE ALL ON FUNCTION public.oe_move_save(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_move_save(text, text[]) TO authenticated;

-- ── PART B — the answer governs the order ───────────────────────────────────
DROP FUNCTION IF EXISTS public.oe_goal_weight(uuid, text);

CREATE OR REPLACE FUNCTION public.oe_goal_weight(
  p_user uuid, p_kind text,
  p_level_direction text DEFAULT NULL,
  p_profession_relation text DEFAULT NULL,
  p_decision_rights text DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with w as (
    select params->'goal_kind_weights' as m,
           coalesce((params->>'move_weight')::numeric, 1.4) as mw
    from oe_policy_versions where active order by created_at desc limit 1
  ),
  d as (
    select move_kind, goal, coalesce(goal_secondary, '{}'::text[]) as sec
    from oe_direction where user_id = p_user
  ),
  legacy as (
    select greatest(
      coalesce(((select m from w) -> (select goal from d) ->> p_kind)::numeric, 1.0),
      coalesce((select max(1 + (coalesce(((select m from w) -> s ->> p_kind)::numeric, 1.0) - 1) / 2)
                from (select unnest(sec) as s from d) t), 1.0)
    ) as v
  )
  -- Weights demote, never hide: the floor keeps every record reachable.
  select greatest(0.25, case
    when (select move_kind from d) is null then (select v from legacy)
    when (select move_kind from d) = 'exceptional_only' then 1.0
    when (select move_kind from d) = 'bigger_same'
      then case when p_level_direction = 'lateral' then (select mw from w) else 1.0 end
    when (select move_kind from d) = 'step_up'
      then case when p_level_direction = 'one_above' then (select mw from w) else 1.0 end
    when (select move_kind from d) = 'client_side'
      then case when p_profession_relation = 'different' and p_decision_rights = 'owns'
                then (select mw from w) else 1.0 end
    else 1.0 end);
$function$;

-- "Nothing short of exceptional" raises the floor; it never hides a record.
CREATE OR REPLACE FUNCTION public.oe_gate_min_avg(p_user uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select case when (select move_kind from oe_direction where user_id = p_user) = 'exceptional_only'
              then greatest(4.0, base) else base end
  from (select coalesce((params->>'gate_min_avg')::numeric, 3.0) as base
        from oe_policy_versions where active order by created_at desc limit 1) b;
$function$;

REVOKE ALL ON FUNCTION public.oe_gate_min_avg(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_gate_min_avg(uuid) TO authenticated, service_role;

-- Where he wants to go is his own stated rule — no country named in code.
CREATE OR REPLACE FUNCTION public.oe_place_weight(p_user uuid, p_location text, p_sector text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with rule as (
    select coalesce(nullif(n."values", '{}'::text[]), array[n.value]) as vals
    from public.oe_notebook n
    where n.user_id = p_user and n.entry_kind = 'rule' and n.field = 'place'
      and n.active and n.status = 'active' and n.ratified_at is not null
    limit 1
  ),
  picked as (
    select unnest(vals) as v from rule
  ),
  named as (
    select c.name_en from picked p
      join public.oe_ref_countries c on c.iso2 = p.v
    union
    select c.name_en from picked p
      join public.oe_ref_countries c
        on p.v like 'region:%' and substring(p.v from 8) = any(c.region_codes)
    union
    select r.name_en from picked p
      join public.oe_ref_regions r on p.v = 'region:' || r.code
  )
  select case
    when not exists (select 1 from rule) then 1.0
    when exists (select 1 from named n
                 where nullif(trim(n.name_en),'') is not null
                   and lower(coalesce(p_location,'')) like '%' || lower(n.name_en) || '%') then 1.0
    else 0.5
  end;
$function$;

-- ── PART E — a remark becomes a rule only when he says so ───────────────────
CREATE OR REPLACE FUNCTION public.oe_notebook_promote_comment(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_row oe_notebook%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_row FROM oe_notebook WHERE id = p_id AND user_id = v_uid AND entry_kind = 'comment';
  IF NOT FOUND THEN RAISE EXCEPTION 'that remark is not yours to promote'; END IF;
  IF v_row.field IS NULL OR (v_row.value IS NULL AND COALESCE(array_length(v_row."values",1),0) = 0) THEN
    RAISE EXCEPTION 'that remark carries nothing structured to turn into a rule';
  END IF;

  PERFORM public.oe_filter_save(
    v_row.field,
    COALESCE(NULLIF(v_row.op,''), 'allow'),
    COALESCE(NULLIF(v_row."values", '{}'::text[]), ARRAY[v_row.value]));

  UPDATE oe_notebook SET active = false, updated_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'field', v_row.field);
END $function$;

REVOKE ALL ON FUNCTION public.oe_notebook_promote_comment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oe_notebook_promote_comment(uuid) TO authenticated;

-- ── invariants ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.oe_write_lane_served
WITH (security_invoker = on) AS
SELECT s.id AS serve_id, s.user_id, s.opportunity_id, s.card_id, s.shown_at
FROM public.oe_serves s
JOIN LATERAL (
  SELECT m.lane_final FROM public.oe_matches m
  WHERE m.user_id = s.user_id AND m.opportunity_id = s.opportunity_id
  ORDER BY m.judged_at DESC NULLS LAST LIMIT 1) m ON true
WHERE s.card_id IS NOT NULL AND s.channel <> 'test' AND m.lane_final = 'write';

CREATE OR REPLACE VIEW public.oe_rule_state_mismatch
WITH (security_invoker = on) AS
SELECT n.id, n.user_id, n.entry_kind, n.origin, n.status, n.active, n.ratified_at
FROM public.oe_notebook n
WHERE (n.status = 'active' AND n.active IS NOT TRUE)
   OR (n.entry_kind = 'rule' AND n.origin = 'stated' AND n.active AND n.ratified_at IS NULL);

-- ── the refusal log ─────────────────────────────────────────────────────────
-- oe_card_queue_refused is a standing invariant that must stay empty, so a
-- recorded refusal gets its own log rather than breaking that promise.
CREATE TABLE IF NOT EXISTS public.oe_card_refusals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  opportunity_id uuid REFERENCES public.oe_opportunities(id) ON DELETE RESTRICT,
  card_date date NOT NULL DEFAULT current_date,
  reason text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_card_refusals TO authenticated;
GRANT ALL ON public.oe_card_refusals TO service_role;
ALTER TABLE public.oe_card_refusals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "A member reads their own refusals" ON public.oe_card_refusals
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS oe_card_refusals_user_day ON public.oe_card_refusals(user_id, card_date DESC);
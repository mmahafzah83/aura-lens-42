ALTER TABLE public.oe_direction
  ADD COLUMN IF NOT EXISTS goal text,
  ADD COLUMN IF NOT EXISTS goal_proposed text,
  ADD COLUMN IF NOT EXISTS goal_proposed_reason jsonb,
  ADD COLUMN IF NOT EXISTS goal_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS goal_expires_at date,
  ADD COLUMN IF NOT EXISTS window_declared_on date,
  ADD COLUMN IF NOT EXISTS window_expected_by date;

ALTER TABLE public.oe_direction DROP CONSTRAINT IF EXISTS oe_direction_goal_check;
ALTER TABLE public.oe_direction ADD CONSTRAINT oe_direction_goal_check
  CHECK (goal IS NULL OR goal IN ('income_from_expertise','advancement','visibility','relationships','knowledge'));
ALTER TABLE public.oe_direction DROP CONSTRAINT IF EXISTS oe_direction_goal_proposed_check;
ALTER TABLE public.oe_direction ADD CONSTRAINT oe_direction_goal_proposed_check
  CHECK (goal_proposed IS NULL OR goal_proposed IN ('income_from_expertise','advancement','visibility','relationships','knowledge'));

-- THE LAW: the goal is the member's word. The engine may propose; only the
-- member's own confirmation, through the RPC, may write `goal`.
CREATE OR REPLACE FUNCTION public.oe_direction_goal_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oe_direction_goal_guard ON public.oe_direction;
CREATE TRIGGER trg_oe_direction_goal_guard
BEFORE INSERT OR UPDATE ON public.oe_direction
FOR EACH ROW EXECUTE FUNCTION public.oe_direction_goal_guard();

-- THE PROPOSAL: a lookup, never a guess and never a model call. If the profile
-- points at nothing, the proposal stays null and the question is asked plainly.
CREATE OR REPLACE FUNCTION public.oe_goal_propose(p_user uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_text text; v_grade text; v_goal text; v_from text[] := '{}';
BEGIN
  IF p_user IS NULL THEN RETURN NULL; END IF;
  SELECT lower(COALESCE(d.north_star_goal,'') || ' ' || COALESCE(d.brand_assessment_answers::text,''))
    INTO v_text FROM diagnostic_profiles d WHERE d.user_id = p_user;
  SELECT lower(COALESCE(i.highest_standing->>'grade_label','')) INTO v_grade
    FROM oe_member_identity i WHERE i.user_id = p_user;

  IF NULLIF(trim(COALESCE(v_text,'')),'') IS NOT NULL THEN
    v_from := v_from || ARRAY['diagnostic_profiles.north_star_goal','diagnostic_profiles.brand_assessment_answers'];
  END IF;

  v_goal := CASE
    WHEN v_text ~ '(income|revenue|fees|clients|client base|own practice|consultancy|advisory business|monetis|monetiz)' THEN 'income_from_expertise'
    WHEN v_text ~ '(partner|principal|c-suite|csuite|chief|board seat|next seat|promotion|senior role|transition to|lead a major)' THEN 'advancement'
    WHEN v_text ~ '(visib|thought leader|recognis|recogniz|known for|personal brand|speak|audience|influence)' THEN 'visibility'
    WHEN v_text ~ '(network|relationship|rooms|connect|peers|community)' THEN 'relationships'
    WHEN v_text ~ '(learn|knowledge|stay ahead|keep current|skills|research)' THEN 'knowledge'
    ELSE NULL END;

  IF v_goal IS NULL AND v_grade ~ '(director|partner|chief|vice president|managing)' THEN
    v_goal := 'advancement';
    v_from := v_from || ARRAY['oe_member_identity.highest_standing'];
  ELSIF v_goal = 'advancement' AND v_grade ~ '(director|partner|chief|vice president|managing)' THEN
    v_from := v_from || ARRAY['oe_member_identity.highest_standing'];
  END IF;

  INSERT INTO oe_direction(user_id, goal_proposed, goal_proposed_reason)
  VALUES (p_user, v_goal, jsonb_build_object('from', to_jsonb(v_from)))
  ON CONFLICT (user_id) DO UPDATE SET
    goal_proposed = EXCLUDED.goal_proposed,
    goal_proposed_reason = EXCLUDED.goal_proposed_reason,
    updated_at = now()
  WHERE oe_direction.goal IS NULL;

  RETURN v_goal;
END $$;

-- THE CONFIRMATION: the member's own hand, through the app.
CREATE OR REPLACE FUNCTION public.oe_goal_save(p_goal text DEFAULT NULL, p_defer boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_row oe_direction%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_goal IS NOT NULL AND p_goal NOT IN ('income_from_expertise','advancement','visibility','relationships','knowledge') THEN
    RAISE EXCEPTION 'unknown goal';
  END IF;
  IF p_goal IS NULL AND NOT p_defer THEN RAISE EXCEPTION 'nothing to save'; END IF;

  PERFORM set_config('oe.goal_confirm', 'member', true);

  INSERT INTO oe_direction(user_id, goal, goal_confirmed_at, goal_expires_at, window_declared_on, window_expected_by)
  VALUES (v_uid, p_goal,
    CASE WHEN p_goal IS NOT NULL THEN now() END,
    CASE WHEN p_goal IS NOT NULL THEN current_date + 90 WHEN p_defer THEN current_date + 7 END,
    CASE WHEN p_goal IS NOT NULL THEN current_date END,
    CASE WHEN p_goal IS NOT NULL THEN current_date + 14 END)
  ON CONFLICT (user_id) DO UPDATE SET
    goal = COALESCE(EXCLUDED.goal, oe_direction.goal),
    goal_confirmed_at = CASE WHEN EXCLUDED.goal IS NOT NULL THEN now() ELSE oe_direction.goal_confirmed_at END,
    goal_expires_at = CASE WHEN EXCLUDED.goal IS NOT NULL THEN current_date + 90
                           WHEN p_defer THEN current_date + 7 ELSE oe_direction.goal_expires_at END,
    -- the window is declared once, on the first goal, and never moved forward
    window_declared_on = CASE WHEN EXCLUDED.goal IS NOT NULL AND oe_direction.window_declared_on IS NULL
                              THEN current_date ELSE oe_direction.window_declared_on END,
    window_expected_by = CASE WHEN EXCLUDED.goal IS NOT NULL AND oe_direction.window_expected_by IS NULL
                              THEN current_date + 14 ELSE oe_direction.window_expected_by END,
    updated_at = now()
  RETURNING * INTO v_row;

  PERFORM set_config('oe.goal_confirm', '', true);
  RETURN to_jsonb(v_row);
END $$;

REVOKE ALL ON FUNCTION public.oe_goal_save(text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_goal_save(text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.oe_goal_propose(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_goal_propose(uuid) TO service_role;

-- the window is a promise with a date on it, so a missed date is recorded
ALTER TABLE public.oe_learning_events DROP CONSTRAINT IF EXISTS oe_learning_events_process_check;
ALTER TABLE public.oe_learning_events ADD CONSTRAINT oe_learning_events_process_check
  CHECK (process = ANY (ARRAY['stated_preference','source_quality','learned_ranking','card_withheld','window_missed']));

CREATE OR REPLACE FUNCTION public.oe_goal_window(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_d oe_direction%ROWTYPE; v_shown boolean; v_missed boolean;
BEGIN
  SELECT * INTO v_d FROM oe_direction WHERE user_id = p_user;
  IF v_d.window_expected_by IS NULL THEN RETURN NULL; END IF;
  SELECT EXISTS(SELECT 1 FROM oe_serves s WHERE s.user_id = p_user AND s.shown_at::date >= v_d.window_declared_on)
    INTO v_shown;
  IF v_shown THEN RETURN NULL; END IF;
  v_missed := current_date > v_d.window_expected_by;
  IF v_missed AND NOT EXISTS(
      SELECT 1 FROM oe_learning_events e WHERE e.user_id = p_user AND e.process = 'window_missed'
        AND (e.detail->>'expected_by') = v_d.window_expected_by::text) THEN
    INSERT INTO oe_learning_events(user_id, process, trigger_reason, detail, applied)
    VALUES (p_user, 'window_missed', 'no first card by the declared date',
      jsonb_build_object('declared_on', v_d.window_declared_on, 'expected_by', v_d.window_expected_by), false);
  END IF;
  RETURN jsonb_build_object('expected_by', v_d.window_expected_by, 'declared_on', v_d.window_declared_on, 'missed', v_missed);
END $$;

REVOKE ALL ON FUNCTION public.oe_goal_window(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.oe_goal_window(uuid) TO service_role;

CREATE TABLE public.oe_grade_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_type text NOT NULL,
  title_pattern text NOT NULL,
  market_level text NOT NULL CHECK (market_level IN ('ic','manager','senior_manager','director','senior_director','vp','c_suite','board')),
  priority smallint NOT NULL DEFAULT 100,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_grade_map TO authenticated;
GRANT ALL ON public.oe_grade_map TO service_role;
ALTER TABLE public.oe_grade_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grade map readable" ON public.oe_grade_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "grade map admin write" ON public.oe_grade_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

INSERT INTO public.oe_grade_map (employer_type, title_pattern, market_level, priority, note) VALUES
 ('consultancy','associate partner|\ypartner\y','vp',10,'Big-4 / strategy firms: partner grades sit at VP in industry'),
 ('consultancy','senior manager','director',20,'Big-4 / strategy firms: senior manager moves to director in industry'),
 ('consultancy','\ydirector\y','senior_director',30,'Big-4 / strategy firms: director moves to senior director in industry'),
 ('government','deputy minister|director general|assistant minister','vp',10,'Government: ministry leadership grades'),
 ('government','general manager','senior_director',20,'Government: a general manager runs a directorate'),
 ('government_affiliate','chief executive|\yceo\y','c_suite',10,'Semi-government: chief executive of an authority or fund'),
 ('government_affiliate','general manager','senior_director',20,'Semi-government: general manager runs a directorate'),
 ('giga_project','executive director','vp',10,'Giga-project: executive director is a sector head'),
 ('giga_project','head of','senior_director',20,'Giga-project: head of a function'),
 ('bank','assistant vice president|\yavp\y','manager',10,'Bank: AVP is a manager grade'),
 ('bank','senior vice president|\ysvp\y','director',15,'Bank: SVP is a director grade'),
 ('bank','vice president|\yvp\y','senior_manager',20,'Bank: VP is a senior-manager grade'),
 ('bank','managing director','vp',25,'Bank: managing director is a VP grade in industry'),
 ('multinational','country manager|country head|general manager','senior_director',10,'Multinational: country leadership'),
 ('private','general manager','senior_director',10,'Private company: general manager runs the business unit');

CREATE TABLE public.oe_identity (
  user_id uuid PRIMARY KEY,
  current_title text,
  current_employer text,
  employer_type text,
  title_level text,
  market_level text,
  source text CHECK (source IN ('member','cv','linkedin','diagnostic')),
  source_date date,
  confirmed_at timestamptz,
  conflict jsonb,
  status text NOT NULL DEFAULT 'inferred' CHECK (status IN ('confirmed','inferred','needs_confirmation')),
  candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  member_title text,
  member_employer text,
  member_level text,
  member_confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_identity TO authenticated;
GRANT ALL ON public.oe_identity TO service_role;
ALTER TABLE public.oe_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "identity own read" ON public.oe_identity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- The literal ladder level of a title. Twin of parseLevel in _shared/oeEligibility.ts.
CREATE OR REPLACE FUNCTION public.oe_title_level(p text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE t text; h text; pass int;
BEGIN
  IF p IS NULL OR btrim(p) = '' THEN RETURN NULL; END IF;
  h := btrim(regexp_replace(p, '(\s[-–—|]\s|,|\().*$', ''));
  FOR pass IN 1..2 LOOP
    t := CASE WHEN pass = 1 THEN h ELSE p END;
    IF t ~* '(board (nomination|member|seat)|non-?executive director|عضو مجلس إدارة)' THEN RETURN 'board'; END IF;
    IF t ~* '^\s*(chief\y|(group\s+)?(ceo|cfo|coo|cto|cio|cdo)\y|president\y|الرئيس التنفيذي|رئيس تنفيذي)' THEN RETURN 'c_suite'; END IF;
    IF t ~* '(managing director|general manager|\yvp\y|vice president|نائب رئيس|المدير العام)' THEN RETURN 'vp'; END IF;
    IF t ~* '(senior director|head of|رئيس قطاع|رئيس قسم)' THEN RETURN 'senior_director'; END IF;
    IF t ~* '(\ydirector\y|مدير تنفيذي)' THEN RETURN 'director'; END IF;
    IF t ~* '(senior manager|مدير أول)' THEN RETURN 'senior_manager'; END IF;
    IF t ~* '(\ymanager\y|\ylead\y|مدير)' THEN RETURN 'manager'; END IF;
    IF t ~* '(consultant|analyst|\yassociate\y|specialist|engineer|officer|coordinator|استشاري|محلل|أخصائي|مهندس)' THEN RETURN 'ic'; END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.oe_norm_employer(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(lower(coalesce(p,'')), '[^a-z0-9\u0600-\u06ff]+', '', 'g'), '')
$$;

CREATE OR REPLACE FUNCTION public.oe_resolve_identity(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cur public.oe_identity%ROWTYPE;
  li record; cv record; dp record; cv_doc record;
  cands jsonb := '[]'::jsonb;
  dated jsonb := '[]'::jsonb;
  pick jsonb; c jsonb; d jsonb;
  v_reason text; v_status text; v_conflict jsonb := NULL;
  v_type text; v_market text; v_tlevel text;
  disagree boolean;
BEGIN
  SELECT * INTO cur FROM public.oe_identity WHERE user_id = p_user;

  -- (c) LinkedIn: newest snapshot, an experience entry with no end date or "Present".
  SELECT s.fetched_at, e.value->>'position' AS title, e.value->>'companyName' AS employer,
         e.value->'startDate'->>'text' AS started
    INTO li
    FROM (SELECT id, fetched_at, experience FROM public.linkedin_profile_snapshots
           WHERE user_id = p_user ORDER BY fetched_at DESC LIMIT 1) s,
         jsonb_array_elements(CASE WHEN jsonb_typeof(s.experience)='array' THEN s.experience ELSE '[]'::jsonb END)
           WITH ORDINALITY e(value, ord)
   WHERE coalesce(e.value->>'position','') <> ''
     AND coalesce(CASE WHEN jsonb_typeof(e.value->'endDate')='object' THEN e.value->'endDate'->>'text'
                       WHEN jsonb_typeof(e.value->'endDate')='string' THEN e.value->>'endDate' END, '')
         ~* '^\s*(present|current|now|حتى الآن|الآن|حاليا)?\s*$'
   ORDER BY coalesce((e.value->'startDate'->>'year')::int, 0) DESC, e.ord ASC
   LIMIT 1;
  IF li.title IS NOT NULL THEN
    cands := cands || jsonb_build_object('source','linkedin','title',li.title,'employer',li.employer,
      'date', li.fetched_at::date, 'started', li.started, 'title_level', public.oe_title_level(li.title),
      'note','entry with no end date on your latest LinkedIn read');
  ELSE
    cands := cands || jsonb_build_object('source','linkedin','none',true,'note','no current entry on your latest LinkedIn read');
  END IF;

  -- (b) CV: the newest CV, a position its own text marks as current.
  SELECT d.id, d.created_at INTO cv_doc FROM public.documents d
   WHERE d.user_id = p_user AND d.document_type = 'cv' ORDER BY d.created_at DESC LIMIT 1;
  IF cv_doc.id IS NOT NULL THEN
    SELECT e.position_ref INTO cv FROM public.oe_member_evidence e
     WHERE e.user_id = p_user AND e.source_id = cv_doc.id AND e.superseded_by IS NULL
       AND e.position_ref IS NOT NULL
       AND (coalesce(e.quote,'') || ' ' || coalesce(e.claim,'')) ~* '(\ypresent\y|\ycurrent(ly)?\y|to date|حتى الآن|حاليا)'
     ORDER BY e.confidence DESC NULLS LAST LIMIT 1;
    IF cv.position_ref IS NOT NULL THEN
      cands := cands || jsonb_build_object('source','cv',
        'title', btrim(split_part(cv.position_ref,' at ',1)),
        'employer', nullif(btrim(substr(cv.position_ref, length(split_part(cv.position_ref,' at ',1)) + 5)),''),
        'date', cv_doc.created_at::date,
        'title_level', public.oe_title_level(split_part(cv.position_ref,' at ',1)),
        'note','the role your CV marks as current');
    ELSE
      cands := cands || jsonb_build_object('source','cv','none',true,'date',cv_doc.created_at::date,
        'note','your CV marks no role as current; every role on it has ended');
    END IF;
  ELSE
    cands := cands || jsonb_build_object('source','cv','none',true,'note','no CV on file');
  END IF;

  -- (d) diagnostic profile.
  SELECT level, firm, created_at INTO dp FROM public.diagnostic_profiles WHERE user_id = p_user;
  IF coalesce(btrim(dp.level),'') <> '' OR coalesce(btrim(dp.firm),'') <> '' THEN
    cands := cands || jsonb_build_object('source','diagnostic','title',nullif(btrim(dp.level),''),
      'employer',nullif(btrim(dp.firm),''),'date',dp.created_at::date,
      'title_level', public.oe_title_level(dp.level),'note','what you told us at sign-up');
  END IF;

  -- (a) member-confirmed.
  IF cur.member_title IS NOT NULL THEN
    cands := cands || jsonb_build_object('source','member','title',cur.member_title,'employer',cur.member_employer,
      'date',cur.member_confirmed_at::date,'title_level',cur.member_level,
      'note','you confirmed this');
  END IF;

  -- Disagreement between any two non-member sources that each state a value.
  FOR c IN SELECT value FROM jsonb_array_elements(cands) WHERE NOT (value ? 'none') AND value->>'source' <> 'member' LOOP
    FOR d IN SELECT value FROM jsonb_array_elements(cands) WHERE NOT (value ? 'none') AND value->>'source' <> 'member' LOOP
      IF c->>'source' < d->>'source' THEN
        disagree := (c->>'title_level' IS NOT NULL AND d->>'title_level' IS NOT NULL AND c->>'title_level' <> d->>'title_level')
          OR (public.oe_norm_employer(c->>'employer') IS NOT NULL AND public.oe_norm_employer(d->>'employer') IS NOT NULL
              AND position(public.oe_norm_employer(c->>'employer') IN public.oe_norm_employer(d->>'employer')) = 0
              AND position(public.oe_norm_employer(d->>'employer') IN public.oe_norm_employer(c->>'employer')) = 0);
        IF disagree THEN
          v_conflict := coalesce(v_conflict, '{}'::jsonb)
            || jsonb_build_object(c->>'source', jsonb_build_object('title',c->'title','employer',c->'employer','level',c->'title_level','date',c->'date'))
            || jsonb_build_object(d->>'source', jsonb_build_object('title',d->'title','employer',d->'employer','level',d->'title_level','date',d->'date'));
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Precedence.
  SELECT value INTO pick FROM jsonb_array_elements(cands)
   WHERE value->>'source' IN ('cv','linkedin') AND NOT (value ? 'none') AND value->>'title' IS NOT NULL
   ORDER BY (value->>'date')::date DESC NULLS LAST, (value->>'source' = 'linkedin') DESC LIMIT 1;
  v_reason := CASE WHEN pick IS NOT NULL THEN 'newest of CV and LinkedIn by their own dates: ' || (pick->>'source') END;
  IF pick IS NULL THEN
    SELECT value INTO pick FROM jsonb_array_elements(cands) WHERE value->>'source' = 'diagnostic' AND value->>'title' IS NOT NULL;
    v_reason := CASE WHEN pick IS NOT NULL THEN 'no current role on CV or LinkedIn; your sign-up answers' END;
  END IF;

  IF cur.member_title IS NOT NULL AND cur.member_confirmed_at > now() - interval '180 days' THEN
    -- A newer source that disagrees reopens the question; otherwise the member's word stands.
    SELECT value INTO c FROM jsonb_array_elements(cands)
     WHERE value->>'source' IN ('cv','linkedin') AND NOT (value ? 'none')
       AND (value->>'date')::date > cur.member_confirmed_at::date
       AND ((value->>'title_level' IS NOT NULL AND cur.member_level IS NOT NULL AND value->>'title_level' <> cur.member_level)
         OR (public.oe_norm_employer(value->>'employer') IS NOT NULL AND public.oe_norm_employer(cur.member_employer) IS NOT NULL
             AND public.oe_norm_employer(value->>'employer') <> public.oe_norm_employer(cur.member_employer)))
     ORDER BY (value->>'date')::date DESC LIMIT 1;
    IF c IS NULL THEN
      pick := (SELECT value FROM jsonb_array_elements(cands) WHERE value->>'source' = 'member');
      v_reason := 'you confirmed this within 180 days and no newer source disagrees';
      v_conflict := NULL;
    ELSE
      v_conflict := coalesce(v_conflict,'{}'::jsonb)
        || jsonb_build_object('member', jsonb_build_object('title',cur.member_title,'employer',cur.member_employer,'level',cur.member_level,'date',cur.member_confirmed_at::date))
        || jsonb_build_object(c->>'source', jsonb_build_object('title',c->'title','employer',c->'employer','level',c->'title_level','date',c->'date'));
      pick := c;
      v_reason := 'a newer ' || (c->>'source') || ' read disagrees with what you confirmed';
    END IF;
  END IF;

  IF pick IS NULL THEN
    INSERT INTO public.oe_identity (user_id, status, candidates, reason, updated_at)
    VALUES (p_user, 'needs_confirmation', cands, 'no current role found in any source', now())
    ON CONFLICT (user_id) DO UPDATE SET current_title = NULL, current_employer = NULL, employer_type = NULL,
      title_level = NULL, market_level = NULL, source = NULL, source_date = NULL,
      status = 'needs_confirmation', candidates = EXCLUDED.candidates, reason = EXCLUDED.reason,
      conflict = NULL, updated_at = now();
    RETURN jsonb_build_object('user_id', p_user, 'status', 'needs_confirmation', 'candidates', cands);
  END IF;

  SELECT e.entity_kind INTO v_type FROM public.oe_entities e
   WHERE pick->>'employer' IS NOT NULL
     AND (lower(e.name) = lower(pick->>'employer') OR lower(e.name) LIKE lower(pick->>'employer') || ' %')
   ORDER BY (lower(e.name) = lower(pick->>'employer')) DESC, length(e.name) LIMIT 1;
  v_type := coalesce(v_type, 'private');

  IF pick->>'source' = 'member' THEN
    v_tlevel := public.oe_title_level(pick->>'title');
    v_market := coalesce(cur.member_level, v_tlevel);
  ELSE
    v_tlevel := pick->>'title_level';
    SELECT g.market_level INTO v_market FROM public.oe_grade_map g
     WHERE g.employer_type = v_type AND (pick->>'title') ~* g.title_pattern
     ORDER BY g.priority LIMIT 1;
    v_market := coalesce(v_market, v_tlevel);
  END IF;

  v_status := CASE
    WHEN v_conflict IS NOT NULL THEN 'needs_confirmation'
    WHEN pick->>'source' = 'member' THEN 'confirmed'
    ELSE 'inferred' END;

  INSERT INTO public.oe_identity AS i (user_id, current_title, current_employer, employer_type, title_level, market_level,
    source, source_date, confirmed_at, conflict, status, candidates, reason, updated_at)
  VALUES (p_user, pick->>'title', pick->>'employer', v_type, v_tlevel, v_market,
    pick->>'source', (pick->>'date')::date,
    CASE WHEN pick->>'source' = 'member' THEN cur.member_confirmed_at END,
    v_conflict, v_status, cands, v_reason, now())
  ON CONFLICT (user_id) DO UPDATE SET current_title = EXCLUDED.current_title, current_employer = EXCLUDED.current_employer,
    employer_type = EXCLUDED.employer_type, title_level = EXCLUDED.title_level, market_level = EXCLUDED.market_level,
    source = EXCLUDED.source, source_date = EXCLUDED.source_date, confirmed_at = EXCLUDED.confirmed_at,
    conflict = EXCLUDED.conflict, status = EXCLUDED.status, candidates = EXCLUDED.candidates,
    reason = EXCLUDED.reason, updated_at = now();

  RETURN (SELECT to_jsonb(i) FROM public.oe_identity i WHERE i.user_id = p_user);
END $$;
REVOKE EXECUTE ON FUNCTION public.oe_resolve_identity(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.oe_identity_confirm(p_title text, p_employer text, p_level text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); r jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF coalesce(btrim(p_title),'') = '' THEN RAISE EXCEPTION 'title required'; END IF;
  IF p_level IS NOT NULL AND p_level NOT IN ('ic','manager','senior_manager','director','senior_director','vp','c_suite','board') THEN
    RAISE EXCEPTION 'unknown level %', p_level;
  END IF;
  INSERT INTO public.oe_identity (user_id, member_title, member_employer, member_level, member_confirmed_at)
  VALUES (uid, btrim(p_title), nullif(btrim(coalesce(p_employer,'')),''), coalesce(p_level, public.oe_title_level(p_title)), now())
  ON CONFLICT (user_id) DO UPDATE SET member_title = EXCLUDED.member_title, member_employer = EXCLUDED.member_employer,
    member_level = EXCLUDED.member_level, member_confirmed_at = now();
  r := public.oe_resolve_identity(uid);
  -- A changed basis means every level and profession verdict is re-read.
  UPDATE public.oe_matches m SET screen_outcome = NULL, screened_at = NULL
   WHERE m.user_id = uid AND m.screen_gate IN ('level','profession')
     AND EXISTS (SELECT 1 FROM public.oe_opportunities o WHERE o.id = m.opportunity_id AND o.alive);
  INSERT INTO public.job_queue (job_type, user_id, payload, priority, max_attempts)
  SELECT 'oe_screen_member', uid, jsonb_build_object('user_id', uid), 4, 3
  WHERE NOT EXISTS (SELECT 1 FROM public.job_queue j WHERE j.user_id = uid AND j.job_type = 'oe_screen_member' AND j.status IN ('pending','running'));
  RETURN r;
EXCEPTION WHEN unique_violation THEN RETURN r;
END $$;
REVOKE EXECUTE ON FUNCTION public.oe_identity_confirm(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.oe_identity_confirm(text,text,text) TO authenticated;

-- Re-resolve when a new CV, LinkedIn read, or own-record evidence arrives.
CREATE OR REPLACE FUNCTION public.oe_identity_refresh_stmt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM new_rows WHERE user_id IS NOT NULL LOOP
    BEGIN PERFORM public.oe_resolve_identity(u);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.ef_error_log (function_name, user_id, severity, error_message, context)
      VALUES ('oe_resolve_identity', u, 'warning', SQLERRM, jsonb_build_object('table', TG_TABLE_NAME));
    END;
  END LOOP;
  RETURN NULL;
END $$;

CREATE TRIGGER oe_identity_on_snapshot AFTER INSERT ON public.linkedin_profile_snapshots
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.oe_identity_refresh_stmt();
CREATE TRIGGER oe_identity_on_snapshot_upd AFTER UPDATE ON public.linkedin_profile_snapshots
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.oe_identity_refresh_stmt();
CREATE TRIGGER oe_identity_on_evidence AFTER INSERT ON public.oe_member_evidence
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.oe_identity_refresh_stmt();
CREATE TRIGGER oe_identity_on_document AFTER UPDATE ON public.documents
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.oe_identity_refresh_stmt();

-- Nightly, inside the existing guarded calibration job.
SELECT cron.schedule('oe-calibrate-daily', '40 3 * * *',
  $c$do $inner$ begin if public.oe_run_allowed('oe-calibrate-daily') then perform public.oe_calibrate(); perform public.oe_resolve_identity(e.user_id) from public.oe_eligibility e; end if; end $inner$;$c$);

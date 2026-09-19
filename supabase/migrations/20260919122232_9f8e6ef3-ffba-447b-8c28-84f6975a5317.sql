
-- ===================== Item 4: one quote does not verify a card =====================
CREATE TABLE IF NOT EXISTS public.oe_claim_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  claim_key text NOT NULL,
  claim_text text,
  check_kind text NOT NULL CHECK (check_kind IN ('source_fidelity','interpretation','freshness','member_relevance','actionability')),
  status text NOT NULL CHECK (status IN ('pass','fail','unknown')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opportunity_id, claim_key, check_kind)
);
GRANT SELECT ON public.oe_claim_checks TO authenticated;
GRANT ALL ON public.oe_claim_checks TO service_role;
ALTER TABLE public.oe_claim_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own claim checks" ON public.oe_claim_checks FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.oe_check_claims(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  WITH base AS (
    SELECT o.*, m.scores, m.eligibility_outcome,
           COALESCE(jsonb_array_length(COALESCE(m.scores->'cites','[]'::jsonb)),0) cites
      FROM oe_opportunities o
      JOIN LATERAL (SELECT x.* FROM oe_matches x WHERE x.opportunity_id=o.id AND x.user_id=p_user ORDER BY x.judged_at DESC NULLS LAST LIMIT 1) m ON true
     WHERE o.alive
  ), rows AS (
    -- the quotation itself
    SELECT id opportunity_id,'evidence' claim_key, left(evidence_quote,400) claim_text,'source_fidelity' check_kind,
           CASE WHEN quote_verified IS TRUE AND NULLIF(trim(evidence_quote),'') IS NOT NULL THEN 'pass'
                WHEN NULLIF(trim(evidence_quote),'') IS NULL THEN 'fail' ELSE 'unknown' END status,
           jsonb_build_object('source_url',source_url,'quote_attempts',quote_attempts,'cause',quote_fail_reason) evidence FROM base
    UNION ALL
    -- the conclusion drawn from it
    SELECT id,'conclusion', left(COALESCE(scope,title),400),'interpretation',
           CASE WHEN cites > 0 THEN 'pass' ELSE 'fail' END,
           jsonb_build_object('cited_evidence',cites) FROM base
    UNION ALL
    -- how recent it is: a window by record type, not one global rule
    SELECT id,'window', COALESCE(time_kind,'unstated'),'freshness',
           CASE
             WHEN deadline IS NOT NULL AND deadline < current_date THEN 'fail'
             WHEN deadline IS NOT NULL THEN 'pass'
             WHEN time_kind='open_now' AND COALESCE(posting_date,signal_date,first_seen_at::date) > current_date - 30 THEN 'pass'
             WHEN time_kind='open_now' THEN 'fail'
             WHEN chair_type IN ('seat','board') AND COALESCE(signal_date,first_seen_at::date) > current_date - 90 THEN 'pass'
             WHEN COALESCE(signal_date,posting_date,first_seen_at::date) > current_date - 180 THEN 'pass'
             ELSE 'fail' END,
           jsonb_build_object('deadline',deadline,'signal_date',signal_date,'posting_date',posting_date,'time_kind',time_kind) FROM base
    UNION ALL
    -- what supports the connection to this member
    SELECT id,'relevance', COALESCE(sector,''),'member_relevance',
           CASE WHEN cites > 0 AND eligibility_outcome <> 'excluded' THEN 'pass'
                WHEN eligibility_outcome = 'excluded' THEN 'fail' ELSE 'unknown' END,
           jsonb_build_object('cited_evidence',cites,'eligibility',eligibility_outcome) FROM base
    UNION ALL
    -- is the proposed next step actually available
    SELECT id,'next_step', COALESCE(route_url,''),'actionability',
           CASE WHEN public.oe_route_is_specific(route_url,route_kind) AND COALESCE(route_dead,false) IS FALSE THEN 'pass'
                WHEN route_url IS NULL THEN 'fail'
                ELSE 'unknown' END,
           jsonb_build_object('route_kind',route_kind,'route_dead',route_dead,'access_state',access_state) FROM base
  )
  INSERT INTO oe_claim_checks AS c (user_id,opportunity_id,claim_key,claim_text,check_kind,status,evidence,checked_at)
  SELECT p_user, r.opportunity_id, r.claim_key, r.claim_text, r.check_kind, r.status, r.evidence, now() FROM rows r
  ON CONFLICT (user_id,opportunity_id,claim_key,check_kind) DO UPDATE
    SET claim_text=EXCLUDED.claim_text, status=EXCLUDED.status, evidence=EXCLUDED.evidence, checked_at=now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.oe_check_claims(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_check_claims(uuid) TO service_role;

-- ===================== Item 5: truth must be verified before it travels =====================
CREATE TABLE IF NOT EXISTS public.oe_truth_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.oe_opportunities(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reproduced','not_reproduced','member_specific')),
  attempts integer NOT NULL DEFAULT 0,
  cause text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_checked timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_truth_reports TO authenticated;
GRANT ALL ON public.oe_truth_reports TO service_role;
ALTER TABLE public.oe_truth_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own truth reports" ON public.oe_truth_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_oe_truth_reports_updated BEFORE UPDATE ON public.oe_truth_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- same backoff shape as the quote re-check: 1h, 4h, 16h, then abandon
CREATE OR REPLACE FUNCTION public.oe_truth_reports_due(p_limit integer DEFAULT 20, p_max_attempts integer DEFAULT 3)
RETURNS TABLE(id uuid, user_id uuid, opportunity_id uuid, code text, attempts integer, source_url text, route_url text, evidence_quote text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT t.id, t.user_id, t.opportunity_id, t.code, t.attempts, o.source_url, o.route_url, o.evidence_quote
  FROM oe_truth_reports t LEFT JOIN oe_opportunities o ON o.id=t.opportunity_id
  WHERE t.status IN ('pending','not_reproduced') AND t.attempts < p_max_attempts
    AND (t.last_checked IS NULL OR t.last_checked < now() - (interval '1 hour' * power(4, t.attempts)))
  ORDER BY t.last_checked NULLS FIRST, t.first_seen
  LIMIT p_limit
$$;
REVOKE ALL ON FUNCTION public.oe_truth_reports_due(integer,integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_truth_reports_due(integer,integer) TO service_role;

-- only a reproduced report changes shared state
CREATE OR REPLACE FUNCTION public.oe_truth_report_resolve(p_id uuid, p_status text, p_cause text, p_evidence jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t oe_truth_reports%ROWTYPE; o oe_opportunities%ROWTYPE;
BEGIN
  IF p_status NOT IN ('reproduced','not_reproduced','member_specific') THEN
    RETURN jsonb_build_object('ok',false,'reason','unknown_status');
  END IF;
  UPDATE oe_truth_reports SET status=p_status, cause=p_cause, evidence=COALESCE(p_evidence,'{}'::jsonb),
         attempts=attempts+1, last_checked=now() WHERE id=p_id RETURNING * INTO t;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'reason','unknown_report'); END IF;
  IF p_status <> 'reproduced' OR t.opportunity_id IS NULL THEN
    RETURN jsonb_build_object('ok',true,'shared_state_changed',false,'status',p_status);
  END IF;
  SELECT * INTO o FROM oe_opportunities WHERE id=t.opportunity_id;
  IF t.code='dead_route' THEN UPDATE oe_opportunities SET route_dead=true WHERE id=o.id;
  ELSIF t.code='quote_absent' THEN UPDATE oe_opportunities SET quote_verified=false WHERE id=o.id;
  ELSE UPDATE oe_opportunities SET alive=false WHERE id=o.id; END IF;
  -- BOOK THREE. Schema separation is a control, not a proof: see the scan in oe_scan_shared_facts_private().
  INSERT INTO oe_world_facts (kind, entity_id, payload, evidence_url, confidence)
  VALUES (CASE WHEN t.code='listing_page' THEN 'aggregator_fingerprint'
               WHEN t.code='already_happened' THEN 'recurring_event' ELSE 'route_pattern' END,
          NULL, jsonb_build_object('code',t.code,'opportunity_id',o.id,'feed_id',o.feed_id),
          COALESCE(o.route_url,o.source_url), 0.8);
  RETURN jsonb_build_object('ok',true,'shared_state_changed',true,'status',p_status);
END $$;
REVOKE ALL ON FUNCTION public.oe_truth_report_resolve(uuid,text,text,jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_truth_report_resolve(uuid,text,text,jsonb) TO service_role;

-- a member report now enters as pending and changes nothing shared
CREATE OR REPLACE FUNCTION public.oe_record_truth(p_token text, p_code text, p_source text DEFAULT 'app'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_card public.oe_cards%ROWTYPE; v_report uuid;
BEGIN
  IF p_code NOT IN ('dead_route','quote_absent','listing_page','already_happened','wrong_issuer') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;
  SELECT * INTO v_card FROM public.oe_cards WHERE tap_token = p_token AND token_expires_at > now();
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'expired_or_unknown'); END IF;

  INSERT INTO public.oe_serves (user_id, card_id, opportunity_id, channel, lane, why, tapped_at, signal_class, truth_code)
  VALUES (v_card.user_id, v_card.id, v_card.opportunity_id,
          CASE WHEN p_source='email' THEN 'email' ELSE 'app' END, v_card.lane,
          jsonb_build_object('rules','[]'::jsonb,'faces','[]'::jsonb,'scores','{}'::jsonb,'gate','pass'),
          now(), 'truth', p_code)
  ON CONFLICT (card_id) DO UPDATE SET signal_class='truth', truth_code=EXCLUDED.truth_code, tapped_at=now(), updated_at=now();

  INSERT INTO public.oe_truth_reports (user_id, opportunity_id, code, status, evidence)
  VALUES (v_card.user_id, v_card.opportunity_id, p_code, 'pending', jsonb_build_object('card_id',v_card.id,'source',p_source))
  RETURNING id INTO v_report;

  RETURN jsonb_build_object('ok',true,'card_id',v_card.id,'code',p_code,'report_id',v_report,'shared_state_changed',false);
END $$;

-- ===================== Item 6: the privacy claim, corrected =====================
-- Removing the member column does not make private data impossible to store.
-- Free text, JSON, URLs, logs and stored prompts can all carry identifying
-- information, and the service role bypasses row-level security entirely.
-- Schema separation is a CONTROL, not a PROOF. The real exposure is the
-- service-role path, which this scan watches rather than prevents.
CREATE OR REPLACE FUNCTION public.oe_scan_shared_facts_private()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hits integer := 0; r record;
  c_email constant text := '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';
  c_phone constant text := '(\+|00)[0-9][0-9 ()-]{7,}';
  c_uuid  constant text := '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
BEGIN
  FOR r IN
    SELECT 'oe_world_facts' tbl, w.id, concat_ws(' ', w.kind, w.payload::text, w.evidence_url, w.evidence_quote) txt FROM oe_world_facts w
    UNION ALL
    SELECT 'oe_source_facts', s.id, concat_ws(' ', s.cadence, s.id::text) FROM oe_source_facts s
  LOOP
    IF r.txt ~ c_email OR r.txt ~ c_phone
       OR EXISTS (SELECT 1 FROM auth.users u WHERE r.txt LIKE '%'||u.id::text||'%')
       OR EXISTS (SELECT 1 FROM auth.users u WHERE u.email IS NOT NULL AND r.txt ILIKE '%'||u.email||'%')
    THEN
      v_hits := v_hits + 1;
      INSERT INTO ef_error_log(function_name, severity, error_message, context)
      VALUES('oe_scan_shared_facts_private','error',
             'A shared fact row carries something that looks like private member data',
             jsonb_build_object('table', r.tbl, 'row_id', r.id));
    ELSIF r.txt ~ c_uuid AND r.tbl='oe_world_facts' THEN
      NULL; -- opportunity and feed ids are expected here
    END IF;
  END LOOP;
  RETURN v_hits;
END $$;
REVOKE ALL ON FUNCTION public.oe_scan_shared_facts_private() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.oe_scan_shared_facts_private() TO service_role;

-- ===================== Item 7: learning triggers by evidence type =====================
ALTER TABLE public.oe_serves DROP CONSTRAINT IF EXISTS oe_serves_outcome_check;
ALTER TABLE public.oe_serves ADD CONSTRAINT oe_serves_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('applied','shortlisted','won','still_pursuing','nothing','asked'));

CREATE TABLE IF NOT EXISTS public.oe_learning_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  process text NOT NULL CHECK (process IN ('stated_preference','source_quality','learned_ranking')),
  trigger_reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_learning_events TO authenticated;
GRANT ALL ON public.oe_learning_events TO service_role;
ALTER TABLE public.oe_learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own learning events" ON public.oe_learning_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.oe_ranking_evals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  baseline_score numeric NOT NULL,
  candidate_score numeric NOT NULL,
  holdout_n integer NOT NULL,
  accepted boolean NOT NULL DEFAULT false,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.oe_ranking_evals TO authenticated;
GRANT ALL ON public.oe_ranking_evals TO service_role;
ALTER TABLE public.oe_ranking_evals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ranking evaluations" ON public.oe_ranking_evals FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- three independent processes; no counting thresholds
CREATE OR REPLACE FUNCTION public.oe_learning_state(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'stated_preference', jsonb_build_object(
      'updates','immediately on member confirmation',
      'ratified_rules',(SELECT count(*) FROM oe_notebook WHERE user_id=p_user AND entry_kind='rule' AND ratified_at IS NOT NULL AND active)),
    'source_quality', jsonb_build_object(
      'updates','after a report is reproduced',
      'reproduced',(SELECT count(*) FROM oe_truth_reports WHERE status='reproduced'),
      'pending',(SELECT count(*) FROM oe_truth_reports WHERE status IN ('pending','not_reproduced'))),
    'learned_ranking', jsonb_build_object(
      'updates','only when an evaluation beats the baseline on a held-out set',
      'accepted',(SELECT count(*) FROM oe_ranking_evals WHERE user_id=p_user AND accepted),
      'last_eval',(SELECT to_jsonb(e) FROM oe_ranking_evals e WHERE e.user_id=p_user ORDER BY created_at DESC LIMIT 1)),
    'follow_up', jsonb_build_object(
      'asked_after_days',14,
      'still_pursuing',(SELECT count(*) FROM oe_serves WHERE user_id=p_user AND outcome='still_pursuing'),
      'nothing',(SELECT count(*) FROM oe_serves WHERE user_id=p_user AND outcome='nothing')))
$$;
REVOKE ALL ON FUNCTION public.oe_learning_state(uuid) FROM public, anon;

-- ===================== Item 8: the coverage funnel =====================
CREATE OR REPLACE VIEW public.oe_coverage_funnel
WITH (security_invoker = true) AS
WITH s AS (
  SELECT 1 ord, 'registered' stage, 'organisations known' note, (SELECT count(*) FROM oe_entities) n
  UNION ALL SELECT 2,'discovered','have relevant surfaces',(SELECT count(DISTINCT entity_id) FROM oe_surfaces WHERE entity_id IS NOT NULL)
  UNION ALL SELECT 3,'accessible','surfaces we may and can read',(SELECT count(DISTINCT entity_id) FROM oe_surfaces WHERE terms_ok IS TRUE AND entity_id IS NOT NULL)
  UNION ALL SELECT 4,'current','checked within their own schedule',
    (SELECT count(DISTINCT entity_id) FROM oe_surfaces WHERE terms_ok IS TRUE AND entity_id IS NOT NULL AND last_harvested_at IS NOT NULL
       AND last_harvested_at > now() - (CASE lower(COALESCE(cadence,'weekly')) WHEN 'daily' THEN interval '2 days' WHEN 'weekly' THEN interval '9 days' WHEN 'monthly' THEN interval '35 days' ELSE interval '14 days' END))
  UNION ALL SELECT 5,'productive','produced a valid finding in 28 days',
    (SELECT count(DISTINCT o.issuer_id) FROM oe_opportunities o WHERE o.issuer_id IS NOT NULL AND o.first_seen_at > now() - interval '28 days')
  UNION ALL SELECT 6,'useful','produced something a member acted on',
    (SELECT count(DISTINCT o.issuer_id) FROM oe_serves sv JOIN oe_opportunities o ON o.id=sv.opportunity_id WHERE sv.tap='right' AND o.issuer_id IS NOT NULL)
  UNION ALL SELECT 7,'outside_target_market','live records filtered before review because the market is not his',
    (SELECT count(*) FROM oe_opportunities o WHERE o.alive AND COALESCE(public.oe_place_country(o.location),'UNKNOWN') NOT IN ('SA','AE','QA','KW','BH','OM','UNSPECIFIED'))
)
SELECT now() AS generated_at, s.ord AS stage_order, s.stage, s.note, s.n AS count FROM s ORDER BY s.ord;

GRANT SELECT ON public.oe_coverage_funnel TO authenticated, service_role;

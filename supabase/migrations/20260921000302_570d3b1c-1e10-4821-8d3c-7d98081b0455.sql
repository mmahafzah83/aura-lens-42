ALTER TABLE public.oe_opportunity_kinds
  ADD COLUMN IF NOT EXISTS require_en text,
  ADD COLUMN IF NOT EXISTS exclude_en text;

COMMENT ON COLUMN public.oe_opportunity_kinds.require_en IS
  'Optional second condition: the record text must also match this for the kind to apply.';
COMMENT ON COLUMN public.oe_opportunity_kinds.exclude_en IS
  'Optional blocker: if the record text matches this, the kind does not apply.';

-- Order matters. An event, a partnership and a platform are all read before a
-- seat title is allowed to make something a job.
UPDATE public.oe_opportunity_kinds SET sort_order = 10 WHERE code = 'market_signal';
UPDATE public.oe_opportunity_kinds SET sort_order = 11 WHERE code = 'executive_role';

UPDATE public.oe_opportunity_kinds SET
  detect_en = '\y(co-?founder|board observer|joint venture|strategic (alliance|partnership)|syndicate|cap table|media partner|sponsorship (opportunit|package|prospectus)|partnership opportunit|partner(ship)? (programme|program) for)\y',
  detect_ar = '(شريك مؤسس|مشروع مشترك|تحالف استراتيجي|شراكة استراتيجية|شريك إعلامي|فرص الرعاية|راعي)'
WHERE code = 'investment_partnership';

-- A market signal is something that happened. If the record offers a way in,
-- it is not a signal, whatever the verb says.
UPDATE public.oe_opportunity_kinds SET
  detect_en = '\y(acquisition|acquires|merger|privatis|privatiz|restructur|appoints|appointed|names? [a-z ]{0,40} as |resign|steps down|stepped down|term (end|expir)|launches|awarded (a )?contract|signs (an? )?agreement|announces)\y',
  exclude_en = '\y(apply|applicant|application window|how to apply|nominations? (are )?open|call for (speakers|papers|abstracts|nominations|chapters|contributions)|submit (a |an |your )|deadline|vacanc|tender|request for proposal|rfp|rfq|expression of interest|job (id|description|type)|requisition)\y'
WHERE code = 'market_signal';

-- A seat title alone proves nothing. There must be an employer hiring one
-- person into a seat, and the record must not be a partnership or an
-- announcement of something already done.
UPDATE public.oe_opportunity_kinds SET
  require_en = '\y(apply|applicant|application (window|deadline|process)|how to apply|hiring|we are (hiring|looking)|seeking (a|an|candidates|applicants)|job (id|description|type|title)|requisition|vacanc|full[ -]?time|part[ -]?time|employment type|responsibilities|qualifications|minimum requirements|end date|reports to|candidate)\y',
  exclude_en = '\y(media partner|partnership opportunit|sponsorship (opportunit|package|prospectus)|call for (speakers|papers|abstracts|nominations)|(has been|was|were) appointed|appoints|resigned|steps down|stepped down)\y'
WHERE code = 'executive_role';

-- The classifier reads everything the record stored, not the title alone.
CREATE OR REPLACE FUNCTION public.oe_classify_kind(o public.oe_opportunities)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE v_text text; k record;
BEGIN
  -- The law: a shape may never outrank its state.
  IF o.access_state IN ('observed_event','possible_need') THEN RETURN 'market_signal'; END IF;

  v_text := left(concat_ws(' ',
    COALESCE(o.title,''), COALESCE(o.scope,''), COALESCE(o.evidence_quote,''),
    COALESCE(o.chair_type,''), COALESCE(o.raw::text,'')), 20000);

  FOR k IN SELECT code, detect_en, detect_ar, require_en, exclude_en
           FROM public.oe_opportunity_kinds ORDER BY sort_order, code LOOP
    IF ((NULLIF(k.detect_en,'') IS NOT NULL AND v_text ~* k.detect_en)
        OR (NULLIF(k.detect_ar,'') IS NOT NULL AND v_text ~ k.detect_ar))
       AND (NULLIF(k.require_en,'') IS NULL OR v_text ~* k.require_en)
       AND (NULLIF(k.exclude_en,'') IS NULL OR v_text !~* k.exclude_en)
    THEN
      RETURN k.code;
    END IF;
  END LOOP;

  RETURN 'market_signal';
END $function$;

-- A record cannot both pass the gate and carry a refusal.
CREATE OR REPLACE VIEW public.oe_gate_contradiction
WITH (security_invoker = true) AS
SELECT m.id AS match_id, m.user_id, m.opportunity_id, o.title,
       m.screen_gate, m.screen_outcome, m.lane_final, m.rejection_sentence
FROM public.oe_matches m
JOIN public.oe_opportunities o ON o.id = m.opportunity_id AND o.alive
WHERE m.gate_passed IS TRUE AND m.rejection_sentence IS NOT NULL;

GRANT SELECT ON public.oe_gate_contradiction TO service_role;

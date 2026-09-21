CREATE OR REPLACE FUNCTION public.oe_classify_kind(o public.oe_opportunities)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE v_text text; v_offer boolean; v_hiring boolean; k record;
BEGIN
  -- The law: a shape may never outrank its state.
  IF o.access_state IN ('observed_event','possible_need') THEN RETURN 'market_signal'; END IF;

  v_text := left(concat_ws(' ',
    COALESCE(o.title,''), COALESCE(o.scope,''), COALESCE(o.evidence_quote,''),
    COALESCE(o.chair_type,''),
    COALESCE((o.raw - 'page_text' - 'html' - 'model')::text,'')), 20000);

  -- The record openly offers something other than a seat: a partnership, a
  -- sponsorship, a platform. Its form is not a job application.
  v_offer := v_text ~* '\y((media|ecosystem|knowledge|content|community) partner|sponsorship|partnership opportunit|partner with us|call for (speakers|papers|nominations|chapters|entries))';

  -- Otherwise, a live application route on a posted opening, or a closing
  -- date, is itself evidence that an employer is hiring into a seat.
  v_hiring := NOT v_offer AND (
    (o.route_kind = 'application' AND o.discovery_kind = 'posted_opening')
    OR o.deadline IS NOT NULL);

  FOR k IN SELECT code, detect_en, detect_ar, require_en, exclude_en
           FROM public.oe_opportunity_kinds ORDER BY sort_order, code LOOP
    CONTINUE WHEN v_hiring AND k.code IN (
      'investment_partnership','speaking_platform','professional_membership',
      'authoring_publication','award_judging','executive_teaching');

    IF ((NULLIF(k.detect_en,'') IS NOT NULL AND v_text ~* k.detect_en)
        OR (NULLIF(k.detect_ar,'') IS NOT NULL AND v_text ~ k.detect_ar))
       AND (NULLIF(k.require_en,'') IS NULL OR v_text ~* k.require_en OR v_hiring)
       AND (NULLIF(k.exclude_en,'') IS NULL OR v_text !~* k.exclude_en)
    THEN
      RETURN k.code;
    END IF;
  END LOOP;

  RETURN 'market_signal';
END $function$;

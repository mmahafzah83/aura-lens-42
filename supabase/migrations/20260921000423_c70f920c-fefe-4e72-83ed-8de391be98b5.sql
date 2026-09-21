UPDATE public.oe_opportunity_kinds SET
  detect_en = '\y(jury|judging panel|panel of judges|judge for the|award(s)? (jury|judging|panel|committee)|call for (entries|nominations) for the)\y',
  detect_ar = '(لجنة تحكيم|فتح باب الترشيح للجائزة|محكم في جائزة)'
WHERE code = 'award_judging';

UPDATE public.oe_opportunity_kinds SET
  detect_en = '\y(tender|request for proposal|rfp|rfq|framework agreement|prequalification|procurement notice|expression of interest|eoi|consultan(t|cy) services|seeking (consultants|experts|firms|service providers|suppliers|bidders))\y',
  exclude_en = '\y(job (id|description|type|category)|requisition|employment type|days left to apply|equal opportunity employer|benefits package)\y'
WHERE code = 'mandate_tender';

UPDATE public.oe_opportunity_kinds SET
  detect_en = '\y(co-?founder|board observer|joint venture|strategic (alliance|partnership)|syndicate|cap table|media partner|sponsorship (opportunit|package|prospectus)|partnership opportunit|partner with us|co-?produce|seeking organi[sz]ations)\y',
  detect_ar = '(شريك مؤسس|مشروع مشترك|تحالف استراتيجي|شراكة استراتيجية|شريك إعلامي|فرص الرعاية)'
WHERE code = 'investment_partnership';

-- The saved page text is site furniture: cookie notices, menus, unrelated
-- headlines. Reading it made the classifier worse, so the record's own fields
-- are what it reads.
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
    COALESCE(o.chair_type,''),
    COALESCE((o.raw - 'page_text' - 'html' - 'model')::text,'')), 20000);

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

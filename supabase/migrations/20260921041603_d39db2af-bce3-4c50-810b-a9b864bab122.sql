CREATE OR REPLACE VIEW public.oe_card_queue_refused
WITH (security_invoker = true) AS
SELECT c.id AS card_id, c.user_id, c.opportunity_id, c.card_date, c.lane,
       CASE
         WHEN NOT COALESCE((o.kind_completeness->>'complete')::boolean, false) THEN 'kind_incomplete'
         WHEN m.screen_outcome IS DISTINCT FROM 'survivor' THEN 'not_survivor'
         ELSE 'no_presentation_line'
       END AS refusal
FROM public.oe_cards c
JOIN public.oe_opportunities o ON o.id = c.opportunity_id
LEFT JOIN LATERAL (
  SELECT y.* FROM public.oe_matches y
   WHERE y.user_id = c.user_id AND y.opportunity_id = c.opportunity_id
   ORDER BY y.judged_at DESC NULLS LAST LIMIT 1
) m ON true
WHERE c.card_date = CURRENT_DATE
  AND c.opportunity_id IS NOT NULL
  AND (
    NOT COALESCE((o.kind_completeness->>'complete')::boolean, false)
    OR m.screen_outcome IS DISTINCT FROM 'survivor'
    OR NULLIF(btrim(COALESCE(m.presentation_line, '')), '') IS NULL
  );

GRANT SELECT ON public.oe_card_queue_refused TO service_role;
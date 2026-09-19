WITH batch AS (
  SELECT jsonb_agg(opportunity_id ORDER BY opportunity_id) AS ids
  FROM (
    SELECT m.opportunity_id
    FROM public.oe_matches m
    JOIN public.oe_opportunities o ON o.id = m.opportunity_id
    WHERE m.user_id = '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3'::uuid
      AND o.alive
      AND m.score_avg IS NULL
    ORDER BY m.opportunity_id
    LIMIT 7
  ) x
)
UPDATE public.job_queue
SET payload = jsonb_build_object(
      'user_id', '9e0c6ee1-6562-4fdc-89ba-d62b39f02bb3',
      'judge_max', 7,
      'coverage_sweep', true,
      'opportunity_ids', (SELECT ids FROM batch)
    ),
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    scheduled_for = now(),
    claimed_at = NULL,
    claimed_by = NULL,
    updated_at = now()
WHERE id = '33dc579b-b16f-4340-917c-ac2bd52ab8a1'::uuid;
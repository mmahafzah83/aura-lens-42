CREATE OR REPLACE FUNCTION public.enqueue_voice_distill_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted int := 0;
BEGIN
  WITH base AS (
    SELECT
      lp.user_id,
      COUNT(*)::int AS total_corpus,
      (
        SELECT MAX(tl.created_at)
        FROM public.training_logs tl
        WHERE tl.user_id = lp.user_id
          AND tl.pillar = 'voice_distill'
      ) AS last_run
    FROM public.linkedin_posts lp
    WHERE lp.source_type = 'aura_generated'
      AND lp.tracking_status = 'published'
      AND lp.post_text IS NOT NULL
      AND lp.user_id IS NOT NULL
    GROUP BY lp.user_id
  ),
  scored AS (
    SELECT
      b.user_id,
      b.total_corpus,
      b.last_run,
      (
        SELECT COUNT(*)::int
        FROM public.linkedin_posts lp2
        WHERE lp2.user_id = b.user_id
          AND lp2.source_type = 'aura_generated'
          AND lp2.tracking_status = 'published'
          AND lp2.post_text IS NOT NULL
          AND (b.last_run IS NULL OR lp2.published_at > b.last_run)
      ) AS new_since,
      CASE
        WHEN b.last_run IS NULL THEN 9999
        ELSE LEAST(9999, GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - b.last_run)) / 86400)::int))
      END AS days_since
    FROM base b
  ),
  eligible AS (
    SELECT *
    FROM scored
    WHERE total_corpus >= 5
      AND (last_run IS NULL OR new_since >= 3 OR days_since >= 30)
  ),
  ins AS (
    INSERT INTO public.job_queue (job_type, user_id, payload, priority)
    SELECT
      'voice_distill',
      user_id,
      jsonb_build_object(
        'total_corpus', total_corpus,
        'new_since',    new_since,
        'days_since',   days_since
      ),
      days_since
    FROM eligible
    ON CONFLICT (job_type, user_id) WHERE (status = ANY (ARRAY['pending'::text, 'claimed'::text]))
    DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_inserted FROM ins;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_voice_distill_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_voice_distill_jobs() TO service_role;
UPDATE public.job_queue
SET max_attempts = GREATEST(max_attempts, 8),
    updated_at = now()
WHERE id = '33dc579b-b16f-4340-917c-ac2bd52ab8a1'::uuid;
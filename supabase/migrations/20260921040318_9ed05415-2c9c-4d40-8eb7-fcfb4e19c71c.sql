SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'oe-enqueue-judging-daily';

SELECT cron.schedule(
  'oe-enqueue-judging-daily',
  '30 0 * * *',
  $$
  SELECT net.http_post(
    url := 'https://zddlsztxfzvevzjbuocc.supabase.co/functions/v1/oe-enqueue-judging',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);